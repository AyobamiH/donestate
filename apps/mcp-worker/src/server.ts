import { env } from "cloudflare:workers";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer, type ServerContext } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { authHandler, EXECUTION_SCOPE, type AuthEnv } from "./auth";
import { RunCoordinator } from "./coordinator";
import { CredentialVault } from "./credential-vault";
import { createCredentialSetup } from "./credential-settings";
import { createGitHubAppSetup } from "./github-app-settings";
import type { DoneStateEnv } from "./environment";
import { getBranchHead, getRepositoryAccess } from "./github";
import { mcpAuthInfo, type TokenInspector } from "./mcp-auth";
import { MaintenanceRegistry } from "./maintenance-registry";
import { allowsMarketplaceDevelopmentRequest, isMarketplaceDevelopment } from "./marketplace-development";
import {
  AUTHORITY_CLASSES,
  VERIFICATION_CONTRACT_VERSION,
  type GitHubAuthProps,
  type HostedObjective,
  type VerificationAttestation,
  type VerificationResponseV2,
} from "./types";
import { assertRef, assertRepository } from "./validation";

export { RunCoordinator } from "./coordinator";
export { CredentialVault } from "./credential-vault";
export { MaintenanceRegistry } from "./maintenance-registry";
export { OAuthStateStore } from "./oauth-state";
export { Sandbox } from "@cloudflare/sandbox";

function doneStateEnv(): DoneStateEnv {
  const required = ["COOKIE_ENCRYPTION_KEY", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY", "USER_CREDENTIAL_ENCRYPTION_KEY"] as const;
  for (const key of required) {
    if (typeof Reflect.get(env, key) !== "string" || !Reflect.get(env, key)) throw new Error(`missing Worker secret: ${key}`);
  }
  return env as DoneStateEnv;
}

function authProps(context: ServerContext): GitHubAuthProps {
  const props = context.http?.authInfo?.extra?.props;
  if (!props || typeof props !== "object") throw new Error("GitHub authentication is required");
  const login = Reflect.get(props, "login");
  const accessToken = Reflect.get(props, "accessToken");
  if (typeof login !== "string" || !login || typeof accessToken !== "string" || !accessToken) {
    throw new Error("GitHub authentication context is incomplete");
  }
  const name = Reflect.get(props, "name");
  const email = Reflect.get(props, "email");
  const origin = Reflect.get(props, "origin");
  if (typeof origin !== "string" || !origin) throw new Error("Reconnect DoneState to enable secure credential setup");
  const reviewMode = Reflect.get(props, "reviewMode") === true;
  return {
    userId: login,
    login,
    accessToken,
    name: typeof name === "string" ? name : null,
    email: typeof email === "string" ? email : null,
    origin,
    reviewMode,
  };
}

function requireWritableIdentity(identity: GitHubAuthProps): void {
  if (identity.reviewMode) {
    throw new Error("BLOCKED_AUTHORITY: the OpenAI reviewer account is read-only");
  }
}

function coordinator(runId: string) {
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error("runId must be a UUID");
  return doneStateEnv().RUN_COORDINATOR.getByName(runId);
}

function credentialVault(login: string) {
  return doneStateEnv().CREDENTIAL_VAULT.getByName(login);
}

function maintenanceRegistry() {
  return doneStateEnv().MAINTENANCE_REGISTRY.getByName("global");
}

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function requireExecutionScope(context: ServerContext): void {
  if (!context.http?.authInfo?.scopes.includes(EXECUTION_SCOPE)) {
    throw new Error(`OAuth scope ${EXECUTION_SCOPE} is required`);
  }
}

const authoritySchema = z.enum(AUTHORITY_CLASSES);
const verificationRequirementBase = {
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  criterionIndex: z.number().int().min(0).max(19),
};
const repositoryPathSchema = z.string().min(1).max(500).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/);
const verificationRequirementSchema = z.discriminatedUnion("kind", [
  z.object({ ...verificationRequirementBase, kind: z.literal("path_exists"), path: repositoryPathSchema }),
  z.object({ ...verificationRequirementBase, kind: z.literal("path_absent"), path: repositoryPathSchema }),
  z.object({
    ...verificationRequirementBase,
    kind: z.literal("file_contains"),
    path: repositoryPathSchema,
    values: z.array(z.string().min(1).max(2_000)).min(1).max(20),
  }),
  z.object({
    ...verificationRequirementBase,
    kind: z.literal("json_equals"),
    path: repositoryPathSchema,
    pointer: z.string().max(1_000).regex(/^(?:|\/(?:[^~/]|~[01])*)$/),
    expected: z.json(),
  }),
  z.object({
    ...verificationRequirementBase,
    kind: z.literal("changed_files"),
    max: z.number().int().min(0).max(300),
    allowedPaths: z.array(repositoryPathSchema).min(1).max(300),
  }),
  z.object({
    ...verificationRequirementBase,
    kind: z.literal("github_checks_pass"),
    requiredNames: z.array(z.string().min(1).max(200)).max(50),
  }),
]);
const attestationV1Schema = z.object({
  schema: z.literal("donestate.verification-attestation.v1"),
  runId: z.string().uuid(),
  executionSnapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["verified", "failed", "uncertain"]),
  issuedBy: z.string().min(1).max(200),
  issuedAt: z.string().datetime(),
  evidenceRefs: z.array(z.string().min(1).max(2_000)).min(1).max(100),
  receiptDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  signature: z.object({
    algorithm: z.literal("ed25519"),
    publicKeyPem: z.string().min(1).max(10_000),
    signerFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    signatureBase64: z.string().min(1).max(10_000),
  }),
});
const attestationV2Schema = z.object({
  schema: z.literal("donestate.verification-attestation.v2"),
  runId: z.string().uuid(),
  executionSnapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
  verificationNonce: z.string().regex(/^[a-f0-9]{64}$/),
  handoffDigest: z.string().regex(/^[a-f0-9]{64}$/),
  verificationReportDigest: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["verified", "failed", "uncertain"]),
  issuedBy: z.string().min(1).max(200),
  issuedAt: z.string().datetime(),
  evidenceRefs: z.array(z.string().url().max(2_000)).min(1).max(100),
  signature: z.object({
    algorithm: z.literal("ed25519"),
    publicKeyPem: z.string().min(1).max(10_000),
    signerFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    signatureBase64: z.string().min(1).max(10_000),
  }).strict(),
}).strict();
const attestationSchema = z.discriminatedUnion("schema", [attestationV1Schema, attestationV2Schema]);
const verificationRequirementResultSchema = z.object({
  requirementId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  criterionIndex: z.number().int().min(0).max(19),
  kind: z.enum(["path_exists", "path_absent", "file_contains", "json_equals", "changed_files", "github_checks_pass"]),
  verdict: z.enum(["VERIFIED", "CONTRADICTED", "UNPROVEN"]),
  observed: z.json(),
  evidenceRefs: z.array(z.string().url().max(2_000)).max(100),
  explanation: z.string().min(1).max(4_000),
  reasonCode: z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,127}$/).optional(),
}).strict();
const verificationReportSchema = z.object({
  schema: z.literal("opstruth.donestate-verification-report.v1"),
  runId: z.string().uuid(),
  handoffDigest: z.string().regex(/^[a-f0-9]{64}$/),
  verificationNonce: z.string().regex(/^[a-f0-9]{64}$/),
  observedAt: z.string().datetime(),
  subject: z.object({
    repository: z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/),
    providerRepositoryId: z.number().int().positive().nullable(),
    baseHeadSha: z.string().regex(/^[a-f0-9]{40}$/),
    expectedHeadSha: z.string().regex(/^[a-f0-9]{40}$/),
    observedHeadSha: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  }).strict(),
  decision: z.enum(["verified", "failed", "uncertain"]),
  requirementResults: z.array(verificationRequirementResultSchema).max(100),
  subjectErrors: z.array(z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,127}$/)).max(20),
  incompleteActions: z.array(z.object({
    id: z.string().min(1).max(200),
    state: z.enum(["PENDING", "RUNNING", "FAILED", "AMBIGUOUS"]),
  }).strict()).max(100),
  evidenceRefs: z.array(z.string().url().max(2_000)).min(1).max(100),
  changedState: z.literal(false),
}).strict();
const verificationResponseSchema = z.object({
  contractVersion: z.literal(VERIFICATION_CONTRACT_VERSION),
  report: verificationReportSchema,
  attestation: attestationV2Schema.strict(),
}).strict();

function createServer(): McpServer {
  const server = new McpServer({ name: "DoneState", version: "0.3.0" });

  server.registerTool(
    "get_openai_credential_status",
    {
      description: "Check whether the authenticated user has connected their own OpenAI API key for DoneState execution. Never returns the key.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (_input, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      return textResult({
        ...await credentialVault(identity.login).status(identity.login),
        billingOwner: "authenticated_user",
      });
    },
  );

  server.registerTool(
    "create_openai_credential_setup",
    {
      description: "Create a single-use HTTPS setup link where the authenticated user can connect or replace their own OpenAI API key without placing it in ChatGPT.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (_input, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await createCredentialSetup(doneStateEnv(), identity.login, identity.origin));
    },
  );

  server.registerTool(
    "delete_openai_credential",
    {
      description: "Delete the authenticated user's encrypted OpenAI execution credential. An active objective must be cancelled first.",
      inputSchema: { confirm: z.literal(true).describe("Confirm permanent deletion of the stored execution credential") },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (_input, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await credentialVault(identity.login).disconnect(identity.login));
    },
  );

  server.registerTool(
    "get_github_app_status",
    {
      description: "Check whether the least-privilege DoneState GitHub App is configured. Never returns private keys, webhook secrets, or installation tokens.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (_input, context) => {
      requireExecutionScope(context);
      authProps(context);
      return textResult(await maintenanceRegistry().githubAppStatus());
    },
  );

  server.registerTool(
    "create_github_app_setup",
    {
      description: "Create a single-use setup link for the Proof & State owner to create and encrypt the private DoneState GitHub App, then install it on selected repositories.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (_input, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await createGitHubAppSetup(doneStateEnv(), identity.login, identity.origin));
    },
  );

  server.registerTool(
    "select_maintenance_repository",
    {
      description: "Register one explicit repository for DoneState maintenance. Scheduled or automatic work requires the GitHub App to be installed on that repository; automatic repair is always PR-only.",
      inputSchema: {
        repository: z.string().describe("Exact GitHub owner/name"),
        defaultBranch: z.string().default("main"),
        mode: z.enum(["observe", "pr_only"]).default("observe"),
        scheduleEnabled: z.boolean().default(false),
        autoRepair: z.boolean().default(false),
        requiredCheckNames: z.array(z.string().min(1).max(200)).max(20).default([]),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      assertRepository(input.repository);
      assertRef(input.defaultBranch);
      return textResult(await maintenanceRegistry().selectRepository(identity.login, input));
    },
  );

  server.registerTool(
    "list_maintenance_repositories",
    {
      description: "List only the authenticated user's selected maintenance repositories and their PR-only, scheduling, and check policies.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (_input, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      return textResult(await maintenanceRegistry().listRepositories(identity.login));
    },
  );

  server.registerTool(
    "remove_maintenance_repository",
    {
      description: "Remove one repository and its maintenance findings from the authenticated user's DoneState registry. This does not uninstall the GitHub App.",
      inputSchema: { repository: z.string(), confirm: z.literal(true) },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ repository }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await maintenanceRegistry().removeRepository(identity.login, repository));
    },
  );

  server.registerTool(
    "discover_maintenance_work",
    {
      description: "Read selected-repository issues labeled donestate:repair and recent failing GitHub Actions runs. It records bounded internal findings but changes no repository state.",
      inputSchema: { repository: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ repository }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      return textResult(await maintenanceRegistry().discover(identity.login, repository, identity.accessToken));
    },
  );

  server.registerTool(
    "list_maintenance_findings",
    {
      description: "List the authenticated user's bounded maintenance findings. A failing workflow is evidence only; only explicitly labeled issues are repair-eligible.",
      inputSchema: { repository: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ repository }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      return textResult(await maintenanceRegistry().listFindings(identity.login, repository));
    },
  );

  server.registerTool(
    "start_maintenance_repair",
    {
      description: "Start a bounded PR-only Codex repair for one eligible selected-repository finding. Protected authority files are blocked and OpsTruth verification is mandatory.",
      inputSchema: { findingId: z.string().regex(/^[a-f0-9]{64}$/) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ findingId }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      const credential = await credentialVault(identity.login).status(identity.login);
      if (!credential.connected) throw new Error("BLOCKED_CAPABILITY: connect your OpenAI execution credential first");
      return textResult(await maintenanceRegistry().startRepair(identity.login, findingId));
    },
  );

  server.registerTool(
    "create_objective",
    {
      description: "Create a bounded repository objective, pin its exact base commit and optionally queue isolated execution. Requires explicit consequence authorities.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      inputSchema: {
        repository: z.string().describe("GitHub repository in owner/name form"),
        baseRef: z.string().default("main").describe("Exact branch or ref to pin before execution"),
        goal: z.string().min(1).max(20_000),
        acceptanceCriteria: z.array(z.string().min(1).max(2_000)).min(1).max(20),
        authorities: z.array(authoritySchema).min(1).describe("Explicit consequence classes granted for this objective"),
        publication: z.enum(["branch", "pull_request"]).default("pull_request"),
        validationProfile: z.enum(["auto", "node", "python", "rust", "go", "none"]).default("auto"),
        trustedVerifierFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(20).default([]),
        verificationRequirements: z.array(verificationRequirementSchema).max(100).default([])
          .describe("Machine-checkable requirements sealed for independent verification; every acceptance criterion must be covered when a trusted verifier is pinned"),
        maxChangedFiles: z.number().int().min(1).max(500).default(100),
        maxDurationMs: z.number().int().min(60_000).max(7_200_000).default(1_800_000),
        autoStart: z.boolean().default(true),
      },
    },
    async (input, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      const credential = await credentialVault(identity.login).status(identity.login);
      if (!credential.connected) {
        throw new Error("BLOCKED_CAPABILITY: connect your own OpenAI API key with create_openai_credential_setup before creating an objective");
      }
      assertRepository(input.repository);
      assertRef(input.baseRef);
      const selected = (await maintenanceRegistry().listRepositories(identity.login)).find((item) => item.repository === input.repository);
      let githubToken = identity.accessToken;
      let credentialSource = "github_oauth";
      if (selected) {
        if (selected.mode !== "pr_only") throw new Error("BLOCKED_AUTHORITY: selected repository is observe-only");
        const installation = await maintenanceRegistry().installationToken(identity.login, input.repository, "pr_only");
        githubToken = installation.token;
        credentialSource = "github_app_installation";
      }
      const access = await getRepositoryAccess(githubToken, input.repository);
      if (access.private && credentialSource !== "github_app_installation") {
        throw new Error("BLOCKED_CAPABILITY: private repositories require a selected GitHub App installation");
      }
      if (!access.canPush) throw new Error("authenticated GitHub user cannot push to this repository");
      const baseHeadSha = await getBranchHead(githubToken, input.repository, input.baseRef);
      if (!baseHeadSha) throw new Error("baseRef does not exist");
      const runId = crypto.randomUUID();
      const objective: HostedObjective = {
        schema: "donestate.hosted-objective.v1",
        runId,
        repository: input.repository,
        baseRef: input.baseRef,
        baseHeadSha,
        goal: input.goal.trim(),
        acceptanceCriteria: input.acceptanceCriteria.map((item) => item.trim()),
        requestedBy: identity.login,
        authorities: [...new Set(input.authorities)],
        validationProfile: input.validationProfile,
        publication: input.publication,
        verificationContractVersion: VERIFICATION_CONTRACT_VERSION,
        trustedVerifierFingerprints: input.trustedVerifierFingerprints,
        verificationRequirements: input.verificationRequirements,
        maxChangedFiles: input.maxChangedFiles,
        maxDurationMs: input.maxDurationMs,
      };
      const stub = coordinator(runId);
      await stub.create(objective, githubToken);
      const run = input.autoStart ? await stub.start(identity.login) : await stub.get(identity.login);
      return textResult({ run, repositoryPrivate: access.private, credentialSource });
    },
  );

  server.registerTool(
    "start_objective",
    {
      description: "Queue a previously created DoneState objective for durable isolated execution.",
      inputSchema: { runId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await coordinator(runId).start(identity.login));
    },
  );

  server.registerTool(
    "get_objective",
    {
      description: "Get durable state, bounded action results, publication references and the hash-chained event history for an objective.",
      inputSchema: { runId: z.string().uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      return textResult(await coordinator(runId).get(authProps(context).login));
    },
  );

  server.registerTool(
    "cancel_objective",
    {
      description: "Cancel a queued or active objective. Completed, blocked and verification states are not rewritten.",
      inputSchema: { runId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await coordinator(runId).cancel(identity.login));
    },
  );

  server.registerTool(
    "delete_objective",
    {
      description: "Delete a terminal or cancelled objective, including its encrypted run credential, actions and event history.",
      inputSchema: { runId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await coordinator(runId).purge(identity.login));
    },
  );

  server.registerTool(
    "create_verification_handoff",
    {
      description: "Create the exact sealed handoff that an independent verifier such as OpsTruth must inspect and sign.",
      inputSchema: { runId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await coordinator(runId).handoff(identity.login));
    },
  );

  server.registerTool(
    "submit_verifier_attestation",
    {
      description: "Historical compatibility adapter for pre-contract objectives only. New hosted objectives require submit_verifier_response.",
      inputSchema: { attestation: attestationSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ attestation }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await coordinator(attestation.runId).submitAttestation(
        identity.login,
        attestation as VerificationAttestation,
      ));
    },
  );

  server.registerTool(
    "submit_verifier_response",
    {
      description: "Submit the complete versioned OpsTruth verification response for a new hosted objective. The signed report and attestation are validated together and replayed nonces are rejected.",
      inputSchema: { response: verificationResponseSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ response }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await coordinator(response.report.runId).submitVerificationResponse(
        identity.login,
        response as VerificationResponseV2,
      ));
    },
  );

  server.registerTool(
    "request_opstruth_verification",
    {
      description: "Ask the configured independent OpsTruth service to re-observe one sealed run and return the complete versioned verification response. DoneState never signs the result.",
      inputSchema: { runId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      const identity = authProps(context);
      requireWritableIdentity(identity);
      return textResult(await coordinator(runId).requestIndependentVerification(identity.login));
    },
  );

  return server;
}

const apiHandler = createMcpHandler(createServer);
const protectedHandler = {
  async fetch(request: Request, workerEnv: unknown, _ctx: ExecutionContext): Promise<Response> {
    if (!workerEnv || typeof workerEnv !== "object") return new Response("OAuth provider binding is missing", { status: 500 });
    const oauth = Reflect.get(workerEnv, "OAUTH_PROVIDER");
    if (!oauth || typeof oauth !== "object" || typeof Reflect.get(oauth, "unwrapToken") !== "function") {
      return new Response("OAuth provider binding is missing", { status: 500 });
    }
    const authInfo = await mcpAuthInfo(request, oauth as TokenInspector);
    if (!authInfo) return new Response("Invalid access token", { status: 401 });
    return apiHandler.fetch(request, { authInfo });
  },
};

const oauthProvider = new OAuthProvider({
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  clientIdMetadataDocumentEnabled: true,
  scopesSupported: [EXECUTION_SCOPE],
  apiRoute: "/mcp",
  apiHandler: protectedHandler,
  defaultHandler: {
    async fetch(request: Request, workerEnv: unknown, ctx: ExecutionContext) {
      if (!workerEnv || typeof workerEnv !== "object" || !Reflect.get(workerEnv, "OAUTH_PROVIDER")) {
        return new Response("OAuth provider binding is missing", { status: 500 });
      }
      return authHandler.fetch(request, workerEnv as AuthEnv, ctx);
    },
  },
});

export default {
  fetch(request: Request, workerEnv: DoneStateEnv, ctx: ExecutionContext) {
    if (isMarketplaceDevelopment(workerEnv)) {
      if (!allowsMarketplaceDevelopmentRequest(request)) return new Response("Not found", { status: 404 });
      return authHandler.fetch(request, workerEnv as AuthEnv, ctx);
    }
    return oauthProvider.fetch(request, workerEnv, ctx);
  },
  scheduled(_controller: ScheduledController, workerEnv: DoneStateEnv, ctx: ExecutionContext) {
    ctx.waitUntil(workerEnv.MAINTENANCE_REGISTRY.getByName("global").scheduledSweep().then((result) => {
      console.log(JSON.stringify({ message: "maintenance sweep completed", ...result }));
    }).catch((error) => {
      console.error(JSON.stringify({ message: "maintenance sweep failed", error: error instanceof Error ? error.message : "unknown error" }));
    }));
  },
} satisfies ExportedHandler<DoneStateEnv>;

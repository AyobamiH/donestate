import { env } from "cloudflare:workers";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer, type ServerContext } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { authHandler, EXECUTION_SCOPE, type AuthEnv } from "./auth";
import { RunCoordinator } from "./coordinator";
import type { DoneStateEnv } from "./environment";
import { getBranchHead, getRepositoryAccess } from "./github";
import { AUTHORITY_CLASSES, type GitHubAuthProps, type HostedObjective, type VerificationAttestation } from "./types";
import { assertRef, assertRepository } from "./validation";

export { RunCoordinator } from "./coordinator";
export { Sandbox } from "@cloudflare/sandbox";

function doneStateEnv(): DoneStateEnv {
  const required = ["COOKIE_ENCRYPTION_KEY", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "OPENAI_API_KEY", "TOKEN_ENCRYPTION_KEY"] as const;
  for (const key of required) {
    if (typeof Reflect.get(env, key) !== "string" || !Reflect.get(env, key)) throw new Error(`missing Worker secret: ${key}`);
  }
  return env as DoneStateEnv;
}

function authProps(): GitHubAuthProps {
  const props = getMcpAuthContext()?.props;
  if (!props || typeof props !== "object") throw new Error("GitHub authentication is required");
  const login = Reflect.get(props, "login");
  const accessToken = Reflect.get(props, "accessToken");
  if (typeof login !== "string" || !login || typeof accessToken !== "string" || !accessToken) {
    throw new Error("GitHub authentication context is incomplete");
  }
  const name = Reflect.get(props, "name");
  const email = Reflect.get(props, "email");
  return {
    userId: login,
    login,
    accessToken,
    name: typeof name === "string" ? name : null,
    email: typeof email === "string" ? email : null,
  };
}

function coordinator(runId: string) {
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error("runId must be a UUID");
  return doneStateEnv().RUN_COORDINATOR.getByName(runId);
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
const attestationSchema = z.object({
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

function createServer(): McpServer {
  const server = new McpServer({ name: "DoneState", version: "0.2.0" });

  server.registerTool(
    "create_objective",
    {
      description: "Create a bounded repository objective, pin its exact base commit and optionally queue isolated execution. Requires explicit consequence authorities.",
      inputSchema: {
        repository: z.string().describe("GitHub repository in owner/name form"),
        baseRef: z.string().default("main").describe("Exact branch or ref to pin before execution"),
        goal: z.string().min(1).max(20_000),
        acceptanceCriteria: z.array(z.string().min(1).max(2_000)).min(1).max(20),
        authorities: z.array(authoritySchema).min(1).describe("Explicit consequence classes granted for this objective"),
        publication: z.enum(["branch", "pull_request"]).default("pull_request"),
        validationProfile: z.enum(["auto", "node", "python", "rust", "go", "none"]).default("auto"),
        trustedVerifierFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(20).default([]),
        maxChangedFiles: z.number().int().min(1).max(500).default(100),
        maxDurationMs: z.number().int().min(60_000).max(7_200_000).default(1_800_000),
        autoStart: z.boolean().default(true),
      },
    },
    async (input, context) => {
      requireExecutionScope(context);
      const identity = authProps();
      assertRepository(input.repository);
      assertRef(input.baseRef);
      const access = await getRepositoryAccess(identity.accessToken, input.repository);
      if (access.private) {
        throw new Error("BLOCKED_CAPABILITY: private repositories require the planned GitHub App token adapter");
      }
      if (!access.canPush) throw new Error("authenticated GitHub user cannot push to this repository");
      const baseHeadSha = await getBranchHead(identity.accessToken, input.repository, input.baseRef);
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
        trustedVerifierFingerprints: input.trustedVerifierFingerprints,
        maxChangedFiles: input.maxChangedFiles,
        maxDurationMs: input.maxDurationMs,
      };
      const stub = coordinator(runId);
      await stub.create(objective, identity.accessToken);
      const run = input.autoStart ? await stub.start(identity.login) : await stub.get(identity.login);
      return textResult({ run, repositoryPrivate: access.private });
    },
  );

  server.registerTool(
    "start_objective",
    {
      description: "Queue a previously created DoneState objective for durable isolated execution.",
      inputSchema: { runId: z.string().uuid() },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      return textResult(await coordinator(runId).start(authProps().login));
    },
  );

  server.registerTool(
    "get_objective",
    {
      description: "Get durable state, bounded action results, publication references and the hash-chained event history for an objective.",
      inputSchema: { runId: z.string().uuid() },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      return textResult(await coordinator(runId).get(authProps().login));
    },
  );

  server.registerTool(
    "cancel_objective",
    {
      description: "Cancel a queued or active objective. Completed, blocked and verification states are not rewritten.",
      inputSchema: { runId: z.string().uuid() },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      return textResult(await coordinator(runId).cancel(authProps().login));
    },
  );

  server.registerTool(
    "delete_objective",
    {
      description: "Delete a terminal or cancelled objective, including its encrypted run credential, actions and event history.",
      inputSchema: { runId: z.string().uuid() },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      return textResult(await coordinator(runId).purge(authProps().login));
    },
  );

  server.registerTool(
    "create_verification_handoff",
    {
      description: "Create the exact sealed handoff that an independent verifier such as OpsTruth must inspect and sign.",
      inputSchema: { runId: z.string().uuid() },
    },
    async ({ runId }, context) => {
      requireExecutionScope(context);
      return textResult(await coordinator(runId).handoff(authProps().login));
    },
  );

  server.registerTool(
    "submit_verifier_attestation",
    {
      description: "Submit a pinned Ed25519 attestation from an independent verifier. DoneState cannot sign or self-verify this input.",
      inputSchema: { attestation: attestationSchema },
    },
    async ({ attestation }, context) => {
      requireExecutionScope(context);
      return textResult(await coordinator(attestation.runId).submitAttestation(
        authProps().login,
        attestation as VerificationAttestation,
      ));
    },
  );

  return server;
}

const apiHandler = createMcpHandler(createServer);
const protectedHandler = {
  fetch(request: Request, workerEnv: unknown, ctx: ExecutionContext) {
    return apiHandler(request, workerEnv, ctx);
  },
};

export default new OAuthProvider({
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

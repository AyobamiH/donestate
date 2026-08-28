declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TOKEN_ENCRYPTION_KEY: string;
    USER_CREDENTIAL_ENCRYPTION_KEY: string;
    PLATFORM_OWNER_LOGIN: string;
    OPSTRUTH_MCP_URL: string;
    OPSTRUTH_VERIFIER_FINGERPRINT: string;
  }
}

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TOKEN_ENCRYPTION_KEY: string;
    USER_CREDENTIAL_ENCRYPTION_KEY: string;
  }
}

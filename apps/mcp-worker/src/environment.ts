export type DoneStateEnv = Env & Readonly<{
  COOKIE_ENCRYPTION_KEY: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OPENAI_API_KEY: string;
  TOKEN_ENCRYPTION_KEY: string;
}>;

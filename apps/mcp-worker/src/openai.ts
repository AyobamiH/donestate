export function validateOpenAIApiKeyFormat(value: string): string {
  const key = value.trim();
  if (key.length < 20 || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new Error("Enter a valid OpenAI API key without spaces or line breaks");
  }
  return key;
}

const OPENAI_VERIFICATION_ATTEMPTS = 2;
const OPENAI_VERIFICATION_TIMEOUT_MS = 20_000;

function errorCode(error: unknown): string | number | null {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object") return null;
  const code = Reflect.get(error.cause, "code");
  return typeof code === "string" || typeof code === "number" ? code : null;
}

function logTransportFailure(error: unknown, attempt: number): void {
  console.error(JSON.stringify({
    message: "OpenAI credential verification transport failure",
    attempt,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode: errorCode(error),
  }));
}

async function discardResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    console.error(JSON.stringify({
      message: "OpenAI credential verification response could not be discarded",
      status: response.status,
    }));
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function verifyOpenAIApiKey(value: string): Promise<string> {
  const key = validateOpenAIApiKeyFormat(value);
  let lastTransportError: unknown;
  for (let attempt = 1; attempt <= OPENAI_VERIFICATION_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
          "Cache-Control": "no-store",
        },
        redirect: "error",
        signal: AbortSignal.timeout(OPENAI_VERIFICATION_TIMEOUT_MS),
      });
    } catch (error) {
      lastTransportError = error;
      logTransportFailure(error, attempt);
      continue;
    }
    await discardResponse(response);
    if (response.ok) return key;
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenAI rejected this API key or its permissions");
    }
    if (!isRetryableStatus(response.status) || attempt === OPENAI_VERIFICATION_ATTEMPTS) {
      throw new Error("OpenAI could not verify this key right now; try again");
    }
  }
  if (lastTransportError instanceof DOMException && lastTransportError.name === "TimeoutError") {
    throw new Error("OpenAI key verification timed out twice; try again");
  }
  throw new Error("OpenAI could not be reached after two attempts; try again");
}

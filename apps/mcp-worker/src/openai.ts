export function validateOpenAIApiKeyFormat(value: string): string {
  const key = value.trim();
  if (key.length < 20 || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new Error("Enter a valid OpenAI API key without spaces or line breaks");
  }
  return key;
}

export async function verifyOpenAIApiKey(value: string): Promise<string> {
  const key = validateOpenAIApiKeyFormat(value);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("OpenAI could not be reached to verify this key; try again");
  }
  await response.body?.cancel();
  if (response.ok) return key;
  if (response.status === 401 || response.status === 403) {
    throw new Error("OpenAI rejected this API key or its permissions");
  }
  throw new Error("OpenAI could not verify this key right now; try again");
}

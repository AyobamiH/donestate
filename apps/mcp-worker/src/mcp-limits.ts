import { createMcpHandler, type CreateStatelessMcpHandlerOptions, type StatelessMcpServerInput } from "agents/mcp/server";

// Bound work before schema validation on both independently authorised MCP resources.
export const MCP_MAX_TOOL_INPUT_ELEMENTS = 10_000;
export const MCP_HTTP_LIMITS = { maxRequestBodySize: 1024 * 1024 };

export function createBoundedMcpHandler(factory: StatelessMcpServerInput, options: CreateStatelessMcpHandlerOptions = {}) {
  const handler = createMcpHandler(factory, { ...options, ...MCP_HTTP_LIMITS });
  return {
    async fetch(request: Request, requestOptions?: Parameters<typeof handler.fetch>[1]): Promise<Response> {
      // Agents 0.29 does not forward maxRequestBodySize into its legacy handler.
      // Bound the stream before either protocol path; never trust Content-Length.
      if (request.body) {
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MCP_HTTP_LIMITS.maxRequestBodySize) {
              await reader.cancel();
              return new Response("MCP request body exceeds one MiB", { status: 413 });
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        request = new Request(request, { body });
      }
      return handler.fetch(request, requestOptions);
    },
  };
}

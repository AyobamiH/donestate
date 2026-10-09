// Custom domains are not inferred by the SDK's default browser Origin policy.
// Keep the same explicit policy on both independently authorised resources.
export const MCP_BROWSER_ORIGIN_POLICY = {
  allowedOriginHostnames: ["donestate.proofandstate.com"],
};

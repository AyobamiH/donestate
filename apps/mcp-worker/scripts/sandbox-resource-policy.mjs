// The repository compiler alone exceeded 256 MiB in the local acceptance baseline.
// Keep room for npm and the Sandbox service rather than accepting the lite profile.
export const MINIMUM_SANDBOX_MEMORY_MIB = 512;

const memoryByInstanceType = Object.freeze({
  lite: 256,
  dev: 256,
  basic: 1024,
  "standard-1": 4096,
  standard: 4096,
  "standard-2": 6144,
  "standard-3": 8192,
  "standard-4": 12288,
});

export function checkSandboxResources(config) {
  const sandboxes = Array.isArray(config?.containers)
    ? config.containers.filter((container) => container?.class_name === "Sandbox")
    : [];
  if (sandboxes.length !== 1) {
    throw new Error("Production must configure exactly one Sandbox container application");
  }
  const instanceType = sandboxes[0].instance_type;
  if (typeof instanceType !== "string" || !Object.hasOwn(memoryByInstanceType, instanceType)) {
    throw new Error("Production Sandbox must use a documented predefined instance type");
  }
  const memoryMib = memoryByInstanceType[instanceType];
  if (memoryMib < MINIMUM_SANDBOX_MEMORY_MIB) {
    throw new Error(`Sandbox ${instanceType} provides ${memoryMib} MiB; repository validation requires at least ${MINIMUM_SANDBOX_MEMORY_MIB} MiB`);
  }
  return { instanceType, memoryMib };
}

import { WorkerEntrypoint } from "cloudflare:workers";
import worker, { recoveryControl } from "./worker.mjs";
export { ReleaseRun } from "./worker.mjs";
export default worker;

// No mutation or arbitrary DO lookup is exposed. This entrypoint has no public route.
export class ReleaseRecovery extends WorkerEntrypoint {
  async status() { return recoveryControl(this.env,"status"); }
}

import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const dockerfile = fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

const sdkVersion = packageJson.dependencies?.["@cloudflare/sandbox"];
if (typeof sdkVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(sdkVersion)) {
  throw new Error("@cloudflare/sandbox must be pinned to one exact semantic version");
}
const rootLockVersion = packageLock.packages?.[""]?.dependencies?.["@cloudflare/sandbox"];
const resolvedVersion = packageLock.packages?.["node_modules/@cloudflare/sandbox"]?.version;
if (rootLockVersion !== sdkVersion || resolvedVersion !== sdkVersion) {
  throw new Error(`Sandbox package/lock mismatch: package=${sdkVersion} rootLock=${rootLockVersion} resolved=${resolvedVersion}`);
}
const match = dockerfile.match(/^FROM\s+docker\.io\/cloudflare\/sandbox:([^\s]+)$/m);
if (!match) throw new Error("Dockerfile must use an explicit docker.io/cloudflare/sandbox:<version> base");
const imageVersion = match[1];
if (imageVersion !== sdkVersion) {
  throw new Error(`Cloudflare Sandbox SDK/image mismatch: sdk=${sdkVersion} image=${imageVersion}`);
}
console.log(`Cloudflare Sandbox versions aligned at ${sdkVersion}`);

from pathlib import Path

executor_path = Path('apps/mcp-worker/src/executor.ts')
executor = executor_path.read_text()
old = '''async function hasPackageScript(sandbox: Sandbox, repositoryPath: string, scriptName: string): Promise<boolean> {
  try {
    const raw = await sandbox.readFile(`${repositoryPath}/package.json`);
    const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    return typeof parsed.scripts?.[scriptName] === "string";
  } catch {
    return false;
  }
}
'''
new = '''async function hasPackageScript(sandbox: Sandbox, repositoryPath: string, scriptName: string): Promise<boolean> {
  const probe = await sandbox.exec(
    `node -e 'const p=require("./package.json"); process.exit(typeof p.scripts?.[${JSON.stringify(scriptName)}] === "string" ? 0 : 1)'`,
    { cwd: repositoryPath },
  );
  return probe.success;
}
'''
if old not in executor:
    raise SystemExit('executor package-script type correction anchor missing')
executor_path.write_text(executor.replace(old, new, 1))

registry_path = Path('apps/mcp-worker/src/maintenance-registry.ts')
registry = registry_path.read_text()
old = '''        const result = await coordinator.requestIndependentVerification(ownerLogin);
        console.log(JSON.stringify({
          message: "maintenance verification retry completed",
          runId: row.run_id,
          repository,
          headSha,
          state: result.state,
        }));
'''
new = '''        await coordinator.requestIndependentVerification(ownerLogin);
        console.log(JSON.stringify({
          message: "maintenance verification retry completed",
          runId: row.run_id,
          repository,
          headSha,
        }));
'''
if old not in registry:
    raise SystemExit('maintenance retry RPC type correction anchor missing')
registry_path.write_text(registry.replace(old, new, 1))

from pathlib import Path
import re

executor = Path("apps/mcp-worker/src/executor.ts")
text = executor.read_text()

old_sig = '  objective: HostedObjective,\n  openaiApiKey: string,\n  githubToken: string,\n): Promise<Record<string, unknown>> {'
new_sig = '  objective: HostedObjective,\n  repositoryGovernanceRequired: boolean,\n  openaiApiKey: string,\n  githubToken: string,\n): Promise<Record<string, unknown>> {'
if text.count(old_sig) != 1:
    raise SystemExit(f"reconciliation signature context count={text.count(old_sig)}")
text = text.replace(old_sig, new_sig, 1)

old_prompt = 'DONESTATE_OBJECTIVE: implementationPrompt(objective, objective.objectiveClass === "maintenance_pr")'
if text.count(old_prompt) != 1:
    raise SystemExit(f"implementation prompt context count={text.count(old_prompt)}")
text = text.replace(old_prompt, 'DONESTATE_OBJECTIVE: implementationPrompt(objective, repositoryGovernanceRequired)', 1)

call_re = re.compile(
    r'await reconcileImplementationProcess\(\s*'
    r'sandbox\s*,\s*journal\s*,\s*\{\s*'
    r'\.\.\.objective\s*,\s*'
    r'objectiveClass:\s*repositoryGovernanceRequired\s*\?\s*"maintenance_pr"\s*:\s*objective\.objectiveClass\s*,?\s*'
    r'\}\s*,\s*openaiApiKey\s*,\s*githubToken\s*\);',
    re.S,
)
replacement = '''await reconcileImplementationProcess(
      sandbox,
      journal,
      objective,
      repositoryGovernanceRequired,
      openaiApiKey,
      githubToken,
    );'''
text, count = call_re.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f"generated reconciliation call context count={count}")
executor.write_text(text)

test = Path("apps/mcp-worker/test/executor.test.ts")
test_text = test.read_text()
test_text = test_text.replace('import fs from "node:fs";\n', '', 1)
source_re = re.compile(
    r'\s*const source = fs\.readFileSync\(new URL\("\.\./src/executor\.ts", import\.meta\.url\), "utf8"\);\n'
    r'\s*expect\(source\.match\(/sandbox\\\\\.startProcess\\\\\(/g\)\)\.toHaveLength\(1\);\n'
    r'\s*expect\(source\)\.toContain\("autoCleanup: false"\);\n'
    r'\s*expect\(source\)\.toContain\("await sandbox\.getProcess\(processId\)"\);\n'
    r'\s*expect\(source\)\.toContain\(\'state: "AMBIGUOUS"\'\);\n',
)
test_text, count = source_re.subn('\n', test_text, count=1)
if count != 1:
    raise SystemExit(f"test-only source assertion context count={count}")
test.write_text(test_text)

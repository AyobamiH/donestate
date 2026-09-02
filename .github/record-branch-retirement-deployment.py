from pathlib import Path

path = Path('governance/project-ledger.json')
text = path.read_text()

# Replace GOV-004 only.
start = text.index('    {\n      "id":"GOV-004"')
end = text.index('    {\n      "id":"MKT-001"', start)
new_gov = '''    {
      "id":"GOV-004","title":"Retire completed work branches without deleting evidence","stream":"governance","status":"blocked","owner":"Repository owner","lastUpdated":"2026-09-02","staleDate":"2026-09-16",
      "nextAction":"Enable GitHub Automatically delete head branches for AyobamiH/donestate and AyobamiH/opstruth-chatgpt-plugin, then record authenticated provider read-back showing delete_branch_on_merge=true for both repositories.","waitCondition":"The bounded DoneState verified-run retirement runtime is merged and deployed and the branch backlog is reconciled, but both repository APIs still report delete_branch_on_merge=false; this remaining repository-admin setting requires owner authority.","reentryCondition":"Close only when exact merged VERIFIED donestate/<run-id> branches retire automatically, historical/unmerged/unverified evidence branches remain resolvable, and both repositories report ordinary post-merge branch deletion enabled.","dependencies":["GOV-001"],"evidenceIds":["E-021"]
    },
'''
text = text[:start] + new_gov + text[end:]

# Replace E-021 only; it is the final evidence story.
start = text.index('    {\n      "id":"E-021"')
end = text.index('\n    }\n  ]\n}', start) + len('\n    }')
new_evidence = '''    {
      "id":"E-021","date":"2026-09-02","identity":"Branch backlog reconciled and verified-run retirement lifecycle deployed","situation":"DoneState and OpsTruth accumulated merged, superseded and diagnostic branches because both repositories reported delete_branch_on_merge=false and DoneState intentionally lacked arbitrary destructive authority. The visible branch surface made completed work look unresolved and allowed operational debris to compound.","verification":"Conservative one-shot cleanup run 33666714383 succeeded in AyobamiH/donestate and run 33666737621 succeeded in AyobamiH/opstruth-chatgpt-plugin. Final stale-ref cleanup removed superseded OpsTruth precursors and the redundant DoneState ref while preserving historical donestate/<run-id> evidence and explicitly preserved asset branches. PR 74 then merged the bounded retirement runtime as 9bc2adb6fc0796079832ef2b83af3272c806175b after exact PR CI 33668917242 passed core 22, core 24 and hosted-plugin. Post-merge CI 33669086381 ended fully green after one Node 24 rerun confirmed an unrelated lease-timing flake. Deployment 33669086131 succeeded with 112 hosted Worker tests and published DoneState Worker 3e72a7ff-3886-4e63-86a6-af214cc47601 on the hourly schedule. Cleanup run 33669412824 then retired both branch-retirement development refs and its own helper branch. Final branch read-back shows OpsTruth at main only; DoneState retains main, two explicitly preserved asset branches, seven historical donestate/<run-id> evidence branches, and one recent parallel diagnostic branch. Raw repository APIs still report delete_branch_on_merge=false for both repositories.",
      "accountability":{"owner":"Repository owner","status":"blocked","nextAction":"Enable GitHub Automatically delete head branches in both repositories and record provider read-back showing delete_branch_on_merge=true.","waitCondition":"Runtime branch retirement is live, but ordinary GitHub merged-head cleanup remains disabled in both repository settings.","staleDate":"2026-09-16"},
      "outcome":"DoneState now retires only its exact merged independently VERIFIED maintenance run branches, while failed, uncertain, closed-unmerged, historical and foreign evidence is preserved. OpsTruth branch clutter is reduced to main only; ordinary GitHub head-branch cleanup awaits one owner-side setting in each repository.","content":"Exact cleanup runs, PR and merge subjects, green CI, Cloudflare Worker deployment, final branch inventories, strict retirement eligibility, and remaining provider-admin settings.","measurement":"OpsTruth reduced from eighteen branches to one; DoneState reduced from dozens of branches to eleven intentional or active refs; one six-file lifecycle PR merged; 112 Worker tests passed in deployment; one Worker version was published; two repository settings remain false pending owner action."
    }'''
text = text[:start] + new_evidence + text[end:]
path.write_text(text)

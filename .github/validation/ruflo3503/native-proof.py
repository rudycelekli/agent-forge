import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

SOURCE = "dbdceb6184b9ede2c03ac4dadcd838f094c12895"
WORKER_BASE = "edff7124abda1b7228ff18132de78b833411283b"
POLICY_BASE = "aac16fbdb3af21c0ddb989aaff4513a9ec1aaca5"
source = Path(sys.argv[1]).resolve()
evidence = Path(sys.argv[2]).resolve()
evidence.mkdir(parents=True, exist_ok=True)
hashes = {
    "v3/@claude-flow/codex/src/dual-mode/orchestrator.ts": "4911714638007dd875d1f2d58898ce0101195bf1f53a901f6312ac8d50ec7f32",
    "v3/@claude-flow/cli/__tests__/policy-envelope-metering.test.ts": "f6924abdc8803107cf2e85e77b7497b4d0b89e78050e63187766505465685a21",
    "v3/docs/adr/ADR-324-agentic-policy-engine-codex-swarm.md": "83a89dfc6fc90051e30525d7c330415a946157699f7d53d1941557522e5e5720",
}
assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip() == SOURCE
tracked = subprocess.check_output(["git", "ls-files", "v3/@claude-flow/cli/vitest.config.ts", "v3/@claude-flow/security/vitest.config.ts", "v3/@claude-flow/codex/vitest.config.ts", "v3/@claude-flow/security/src/policy/envelope.ts", "v3/@claude-flow/cli/__tests__/policy-runtime.test.ts", "v3/@claude-flow/security/__tests__/agentic-policy-engine.test.ts", "v3/@claude-flow/codex/tests/dual-mode.test.ts", "v3/@claude-flow/cli-core/package.json", "v3/@claude-flow/cli-core/src/mcp-tools/types.ts", "v3/@claude-flow/cli-core/src/mcp-tools/validate-input.ts", "v3/@claude-flow/cli-core/src/output.ts", "v3/@claude-flow/cli-core/src/types.ts"], cwd=source, text=True).splitlines()
tracked.append("v3/@claude-flow/security/src/safe-git.ts")
hashes.update({p: hashlib.sha256((source / p).read_bytes()).hexdigest() for p in tracked})


def assert_hashes():
    actual = {p: hashlib.sha256((source / p).read_bytes()).hexdigest() for p in hashes}
    assert actual == hashes, actual
    return actual


assert_hashes()
node = "node"
vitest = source / "node_modules/vitest/vitest.mjs"
versions = {"node": subprocess.check_output([node, "--version"], text=True).strip()}
for package in ["vitest", "vite", "typescript"]:
    versions[package] = json.loads((source / "node_modules" / package / "package.json").read_text())["version"]
assert versions["node"] == "v24.19.0", versions
assert versions["vitest"] == "4.1.8", versions
assert versions["vite"] == "7.3.0", versions
assert versions["typescript"] == "5.9.3", versions
(evidence / "versions.json").write_text(json.dumps(versions, indent=2) + "\n")

# Preserve the official Codex test options. Resolve its workspace security
# import to the exact checked-out source, rather than an unrelated npm build.
# CLI already has this source alias in its official config.
codex_config = source / ".validation-codex.config.mts"
codex_config.write_text("""import { mergeConfig } from 'vitest/config';
import official from './v3/@claude-flow/codex/vitest.config.ts';
import { fileURLToPath } from 'node:url';
export default mergeConfig(official, { resolve: { alias: [{
  find: '@claude-flow/security/safe-git',
  replacement: fileURLToPath(new URL('./v3/@claude-flow/security/src/safe-git.ts', import.meta.url)),
}, {
  find: /^@claude-flow\\/security$/,
  replacement: fileURLToPath(new URL('./v3/@claude-flow/security/src/index.ts', import.meta.url)),
}] } });
""")
(evidence / "codex-source-alias.config.mts").write_bytes(codex_config.read_bytes())
cli_config = source / ".validation-cli.config.mts"
cli_config.write_text("""import { mergeConfig } from 'vitest/config';
import official from './v3/@claude-flow/cli/vitest.config.ts';
import { fileURLToPath } from 'node:url';
export default mergeConfig(official, { resolve: { alias: [
  { find: '@claude-flow/cli-core/mcp-tools/types', replacement: fileURLToPath(new URL('./v3/@claude-flow/cli-core/src/mcp-tools/types.ts', import.meta.url)) },
  { find: '@claude-flow/cli-core/mcp-tools/validate-input', replacement: fileURLToPath(new URL('./v3/@claude-flow/cli-core/src/mcp-tools/validate-input.ts', import.meta.url)) },
  { find: '@claude-flow/cli-core/output', replacement: fileURLToPath(new URL('./v3/@claude-flow/cli-core/src/output.ts', import.meta.url)) },
  { find: '@claude-flow/cli-core/types', replacement: fileURLToPath(new URL('./v3/@claude-flow/cli-core/src/types.ts', import.meta.url)) },
] } });
""")
(evidence / "cli-source-alias.config.mts").write_bytes(cli_config.read_bytes())
results = {}


def run_tests(name, package, files, passed, failed=0, skipped=0, extra=()):
    report = evidence / (name + ".json")
    command = [node, str(vitest), "run", "--root", str(source / "v3/@claude-flow" / package), *files, "--maxWorkers=1", "--reporter=default", "--reporter=json", "--outputFile=" + str(report), *extra]
    if package == "cli":
        command.extend(["--config", str(cli_config)])
    result = subprocess.run(command, cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    (evidence / (name + ".log")).write_text(result.stdout)
    print(result.stdout, flush=True)
    assert result.returncode == (1 if failed else 0), (name, result.returncode)
    data = json.loads(report.read_text())
    counts = {key: data[key] for key in ["numPassedTests", "numFailedTests", "numPendingTests", "numTotalTests"]}
    assert counts == {"numPassedTests": passed, "numFailedTests": failed, "numPendingTests": skipped, "numTotalTests": passed + failed + skipped}, (name, counts)
    if failed:
        failures = [test for suite in data["testResults"] for test in suite["assertionResults"] if test["status"] == "failed"]
        assert len(failures) == failed
        if name == "before-worker-default":
            expected_names = {mode + " public policy evaluation admits an ordinary generated worker envelope through real MCP dispatch" for mode in ["legacy", "observe", "enforce"]}
            assert {test["fullName"] for test in failures} == expected_names
            # Vitest4 JSON truncates the nested MCPClientError cause in this
            # promise assertion. Its complete default reporter retains it.
            plain = re.sub(r"\x1b\[[0-9;]*m", "", result.stdout)
            assert "Failed Tests 3" in plain
            failure_block = plain.split("Failed Tests 3", 1)[1].split("Test Files", 1)[0]
            groups = re.split(r"\n[⎯]{5,}[^\n]*\n", failure_block)
            for mode in ["legacy", "observe", "enforce"]:
                header = "FAIL __tests__/policy-envelope-metering.test.ts > " + mode + " public policy evaluation > admits an ordinary generated worker envelope through real MCP dispatch"
                matching = [group for group in groups if header in "\n".join(" ".join(line.split()) for line in group.splitlines())]
                assert len(matching) == 1, (mode, matching)
                assert "policy-denied:concurrency-outside-envelope" in matching[0], mode
        else:
            assert all("does not bypass" in test["fullName"] for test in failures)
    results[name] = {"command": command, "exitCode": result.returncode, **counts}


try:
    orchestrator = source / "v3/@claude-flow/codex/src/dual-mode/orchestrator.ts"
    original = orchestrator.read_bytes()
    try:
        orchestrator.write_bytes(subprocess.check_output(["git", "show", WORKER_BASE + ":v3/@claude-flow/codex/src/dual-mode/orchestrator.ts"], cwd=source))
        run_tests("before-worker-default", "cli", ["__tests__/policy-envelope-metering.test.ts"], 24, 3)
    finally:
        orchestrator.write_bytes(original)
    assert_hashes()
    envelope = source / "v3/@claude-flow/security/src/policy/envelope.ts"
    original = envelope.read_bytes()
    try:
        envelope.write_bytes(subprocess.check_output(["git", "show", POLICY_BASE + ":v3/@claude-flow/security/src/policy/envelope.ts"], cwd=source))
        run_tests("before-main-envelope", "cli", ["__tests__/policy-envelope-metering.test.ts"], 3, 9, 15, ["-t", "public policy evaluation.*(does not bypass|zero-cost)"])
    finally:
        envelope.write_bytes(original)
    assert_hashes()
    run_tests("candidate-cli", "cli", ["__tests__/policy-envelope-metering.test.ts", "__tests__/policy-runtime.test.ts"], 46)
    run_tests("candidate-security", "security", ["__tests__/agentic-policy-engine.test.ts"], 14)
    run_tests("candidate-codex", "codex", ["tests/dual-mode.test.ts"], 32, extra=["--config", str(codex_config)])
    assert_hashes()
    subprocess.run(["git", "diff", "--exit-code"], cwd=source, check=True)
    summary = {"source": SOURCE, "versions": versions, "hashes": hashes, "results": results, "candidatePasses": 92, "sourceUnchanged": True, "officialConfigsPreserved": True, "workspaceSourceAliasConfigs": {"codex": str(codex_config.relative_to(source)), "cli": str(cli_config.relative_to(source))}, "fullMonorepoCompletion": False}
    (evidence / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("RUFLO3503_NATIVE_4_1_PASS: 92 candidate tests; both frozen negative baselines; unchanged source", flush=True)
finally:
    codex_config.unlink(missing_ok=True)
    cli_config.unlink(missing_ok=True)
    (evidence / "source-hashes-final.json").write_text(json.dumps(assert_hashes(), indent=2) + "\n")

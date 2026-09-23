const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  codexExecArgs,
  logCodexExecutionSettings,
  parseCodexSettings,
  resolveCodexExecutionSettings
} = require("../src/codex");

test("parses supported Codex settings without inventing missing values", () => {
  assert.deepEqual(parseCodexSettings([
    'model = "gpt-test"',
    'model_reasoning_effort = "high"',
    "[features]",
    "js_repl = true"
  ].join("\n")), {
    model: "gpt-test",
    reasoningEffort: "high"
  });
});

test("resolves target, project, and user settings in precedence order", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kelolin-orch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const repositoryPath = path.join(root, "repo");
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(repositoryPath, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex", "config.toml"), [
    'model = "user-model"',
    'model_reasoning_effort = "medium"',
    'service_tier = "default"'
  ].join("\n"));
  fs.writeFileSync(path.join(repositoryPath, ".codex", "config.toml"), [
    '[models.new_thread]',
    'model = "project-model"',
    'model_reasoning_effort = "high"'
  ].join("\n"));

  assert.deepEqual(resolveCodexExecutionSettings({
    repositoryPath,
    codexReasoningEffort: "low"
  }, { HOME: home }), {
    model: "project-model",
    reasoningEffort: "low",
    serviceTier: "default"
  });
});

test("passes only known settings while preserving json and ephemeral execution", () => {
  assert.deepEqual(codexExecArgs({
    model: "gpt-test",
    reasoningEffort: "low",
    serviceTier: "unknown"
  }, "prompt"), [
    "exec",
    "--json",
    "--ephemeral",
    "--model",
    "gpt-test",
    "--config",
    'model_reasoning_effort="low"',
    "prompt"
  ]);
});

test("writes all execution settings to the task log", () => {
  const lines = [];
  logCodexExecutionSettings({ line: (value) => lines.push(value) }, {
    model: "unknown",
    reasoningEffort: "low",
    serviceTier: "default"
  });

  assert.deepEqual(lines, [
    "Codex model: unknown",
    "Reasoning effort: low",
    "Service tier: default"
  ]);
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { resolveFullTestShell, runFullTest } = require("../src/full-test");

function fixture(t) {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "kelolin-full-test-"));
  t.after(() => fs.rmSync(repositoryPath, { recursive: true, force: true }));
  fs.writeFileSync(path.join(repositoryPath, "full_test.sh"), "#!/bin/bash\nexit 0\n");
  const lines = [];
  return {
    target: { repositoryPath, fullTestShell: path.join(repositoryPath, "bash.exe") },
    logger: { line: (line) => lines.push(line) },
    lines
  };
}

test("FullTest invokes full_test.sh exactly once in the target repository", async (t) => {
  const { target, logger, lines } = fixture(t);
  fs.writeFileSync(target.fullTestShell, "");
  const calls = [];

  await runFullTest(target, 1003, logger, {
    runCommand: async (...args) => {
      calls.push(args);
      return { command: args[0], args: args[1], cwd: args[2].cwd, code: 0, stdout: "", stderr: "" };
    }
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), [target.fullTestShell, ["./full_test.sh"]]);
  assert.equal(calls[0][2].cwd, target.repositoryPath);
  assert.ok(lines.some((line) => line === "FullTest exit code: 0"));
});

test("FullTest treats a non-zero exit as failure without retrying", async (t) => {
  const { target, logger } = fixture(t);
  fs.writeFileSync(target.fullTestShell, "");
  let calls = 0;

  await assert.rejects(
    runFullTest(target, 1003, logger, {
      runCommand: async (command, args, options) => {
        calls += 1;
        return { command, args, cwd: options.cwd, code: 7, stdout: "", stderr: "failed" };
      }
    }),
    /exit code 7/
  );
  assert.equal(calls, 1);
});

test("FullTest reports a missing script without launching a process", async (t) => {
  const { target, logger } = fixture(t);
  fs.rmSync(path.join(target.repositoryPath, "full_test.sh"));
  let called = false;

  await assert.rejects(
    runFullTest(target, 1003, logger, { runCommand: async () => { called = true; } }),
    /script does not exist/
  );
  assert.equal(called, false);
});

test("FullTest uses an explicit configured shell and rejects a missing one", () => {
  const shell = path.resolve("configured-bash");
  assert.equal(resolveFullTestShell({ fullTestShell: shell }, {
    env: {},
    existsSync: (candidate) => candidate === shell
  }), shell);

  assert.throws(() => resolveFullTestShell({ fullTestShell: shell }, {
    env: {},
    existsSync: () => false
  }), /shell does not exist/);
});

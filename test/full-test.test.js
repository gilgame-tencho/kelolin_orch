const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  resolveFullTestScriptPath,
  resolveFullTestShell,
  runFullTest,
  runFullTestTask
} = require("../src/full-test");

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

test("FullTest uses the default full_test.sh exactly once in the target repository", async (t) => {
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
  assert.deepEqual(calls[0].slice(0, 2), [
    target.fullTestShell,
    [path.resolve(target.repositoryPath, "full_test.sh")]
  ]);
  assert.equal(calls[0][2].cwd, target.repositoryPath);
  assert.ok(lines.some((line) => line === "FullTest exit code: 0"));
});

test("FullTest resolves configured root and nested script paths", async (t) => {
  const { target, logger } = fixture(t);
  fs.writeFileSync(target.fullTestShell, "");
  fs.mkdirSync(path.join(target.repositoryPath, "tools"));
  fs.writeFileSync(path.join(target.repositoryPath, "tools", "full_test.sh"), "#!/bin/bash\nexit 0\n");

  for (const configuredPath of ["full_test.sh", "tools/full_test.sh"]) {
    const calls = [];
    target.fullTestScript = configuredPath;
    await runFullTest(target, 1003, logger, {
      runCommand: async (...args) => {
        calls.push(args);
        return { command: args[0], args: args[1], cwd: args[2].cwd, code: 0, stdout: "", stderr: "" };
      }
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1][0], path.resolve(target.repositoryPath, configuredPath));
  }
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
  target.fullTestScript = "missing/full_test.sh";
  let called = false;

  await assert.rejects(
    runFullTest(target, 1003, logger, { runCommand: async () => { called = true; } }),
    /script does not exist/
  );
  assert.equal(called, false);
});

test("FullTest rejects script paths outside the target repository", (t) => {
  const { target } = fixture(t);
  target.fullTestScript = "../full_test.sh";
  assert.throws(() => resolveFullTestScriptPath(target), /inside the target repository/);
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

test("successful FullTest does not post an Issue comment", async () => {
  let notifications = 0;
  await runFullTestTask({ repositoryPath: "C:\\repo", branch: "dev" }, 1003, { line() {} }, {
    runFullTest: async () => ({ code: 0 }),
    postIssueComment: async () => { notifications += 1; }
  });
  assert.equal(notifications, 0);
});

test("failed FullTest posts one minimal notification and preserves the failure", async () => {
  const failure = new Error("sensitive diagnostic text");
  failure.result = { code: 7 };
  const notifications = [];
  const lines = [];

  await assert.rejects(
    runFullTestTask({ repositoryPath: "C:\\secret\\repo", branch: "dev" }, 1003, {
      line: (line) => lines.push(line)
    }, {
      runFullTest: async () => { throw failure; },
      postIssueComment: async (...args) => { notifications.push(args); },
      now: () => new Date("2026-10-28T10:00:00.000Z")
    }),
    (error) => error === failure
  );

  assert.equal(notifications.length, 1);
  const [repositoryPath, issue, body] = notifications[0];
  assert.equal(repositoryPath, "C:\\secret\\repo");
  assert.equal(issue, 1003);
  assert.match(body, /Task-Type: FullTest/);
  assert.match(body, /Test-Result: FAILED/);
  assert.match(body, /Exit-Code: 7/);
  assert.match(body, /Branch: dev/);
  assert.match(body, /Executed-At: 2026-10-28T10:00:00.000Z/);
  assert.doesNotMatch(body, /secret|sensitive diagnostic text/i);
  assert.ok(lines.includes("FullTest failure notification: posted to Issue #1003"));
});

test("launch failure posts ERROR once with unknown exit code", async () => {
  const notifications = [];
  await assert.rejects(
    runFullTestTask({ repositoryPath: "C:\\repo", branch: "dev" }, 1003, { line() {} }, {
      runFullTest: async () => { throw new Error("spawn failed at C:\\secret"); },
      postIssueComment: async (...args) => { notifications.push(args); }
    }),
    /spawn failed/
  );

  assert.equal(notifications.length, 1);
  assert.match(notifications[0][2], /Test-Result: ERROR/);
  assert.match(notifications[0][2], /Exit-Code: unknown/);
  assert.doesNotMatch(notifications[0][2], /spawn failed|secret/i);
});

test("notification failure is logged once and never replaces the FullTest failure", async () => {
  const failure = new Error("original FullTest failure");
  failure.result = { code: 1 };
  const lines = [];
  let attempts = 0;

  await assert.rejects(
    runFullTestTask({ repositoryPath: "C:\\repo", branch: "dev" }, 1003, {
      line: (line) => lines.push(line)
    }, {
      runFullTest: async () => { throw failure; },
      postIssueComment: async () => {
        attempts += 1;
        throw new Error("gh authentication failed");
      }
    }),
    (error) => error === failure
  );

  assert.equal(attempts, 1);
  assert.ok(lines.includes("FullTest failure notification: FAILED for Issue #1003"));
  assert.ok(lines.includes("FullTest notification error: gh authentication failed"));
});

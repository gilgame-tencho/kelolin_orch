const assert = require("node:assert/strict");
const test = require("node:test");

const { postIssueComment } = require("../src/github");

test("posts one issue comment from the target repository", async () => {
  const calls = [];
  await postIssueComment("C:\\repo", 1003, "failure body", {
    runChecked: async (...args) => {
      calls.push(args);
      return { code: 0 };
    }
  });

  assert.deepEqual(calls, [[
    "gh",
    ["issue", "comment", "1003", "--body", "failure body"],
    { cwd: "C:\\repo" }
  ]]);
});

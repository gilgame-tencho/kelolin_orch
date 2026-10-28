const assert = require("node:assert/strict");
const test = require("node:test");

const { shouldCheckCompletedIssue } = require("../src/index");

test("FullTest is never suppressed by completed Issue comments", () => {
  assert.equal(shouldCheckCompletedIssue({ type: "FullTest" }), false);
  assert.equal(shouldCheckCompletedIssue({ type: "resume" }), false);
  assert.equal(shouldCheckCompletedIssue({ type: "test" }), true);
  assert.equal(shouldCheckCompletedIssue({ type: "development" }), true);
});

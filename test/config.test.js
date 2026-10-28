const assert = require("node:assert/strict");
const test = require("node:test");

const { validateTasks } = require("../src/config");

test("accepts FullTest with the existing required issue format", () => {
  assert.doesNotThrow(() => validateTasks({
    targetId: "stampo",
    tasks: [{ issue: 1003, type: "FullTest" }]
  }));
});

test("FullTest remains case-sensitive and requires an issue", () => {
  assert.throws(() => validateTasks({
    targetId: "stampo",
    tasks: [{ issue: 1003, type: "fulltest" }]
  }), /Unknown task type/);

  assert.throws(() => validateTasks({
    targetId: "stampo",
    tasks: [{ type: "FullTest" }]
  }), /issue is required/);
});

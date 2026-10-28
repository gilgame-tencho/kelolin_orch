const assert = require("node:assert/strict");
const test = require("node:test");

const { validateTarget, validateTasks } = require("../src/config");

function validTarget(overrides = {}) {
  return {
    targetId: "stampo",
    repositoryPath: "../store_point",
    branch: "dev",
    remote: "origin",
    ...overrides
  };
}

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

test("validates FullTest script as a non-empty repository-relative path", () => {
  assert.doesNotThrow(() => validateTarget(validTarget({ fullTestScript: "full_test.sh" })));
  assert.doesNotThrow(() => validateTarget(validTarget({ fullTestScript: "tools/full_test.sh" })));

  for (const invalid of ["", "   ", "../full_test.sh", "tools/../../full_test.sh", "..\\full_test.sh", "C:\\tmp\\full_test.sh", "/tmp/full_test.sh"]) {
    assert.throws(() => validateTarget(validTarget({ fullTestScript: invalid })), /fullTestScript/);
  }
});

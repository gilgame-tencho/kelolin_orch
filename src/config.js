const fs = require("node:fs");
const path = require("node:path");

const VALID_TASK_TYPES = new Set([
  "hello",
  "test",
  "Investigation",
  "development",
  "design",
  "development_review_action",
  "design_review_action",
]);

function usage() {
  return [
    "Usage:",
    "  node src/index.js --target targets/stampo.json --tasks tasks/stampo/tasks.json"
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};

  // ### default parameters ###
  args.target = "targets/stampo.json";
  //args.tasks = "tasks/stampo/tasks.json";

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--target" || current === "--tasks") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${current}\n${usage()}`);
      }
      args[current.slice(2)] = value;
      i += 1;
      continue;
    }

    if (current === "--help" || current === "-h") {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n${usage()}`);
  }

  if (args.help) {
    return args;
  }

  if (!args.target || !args.tasks) {
    throw new Error(`Missing required arguments.\n${usage()}`);
  }

  return args;
}

function readJsonFile(filePath, label) {
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label} file does not exist: ${absolutePath}`);
  }

  try {
    const text = fs.readFileSync(absolutePath, "utf8");
    return { data: JSON.parse(text), path: absolutePath };
  } catch (error) {
    throw new Error(`${label} file is not valid JSON: ${absolutePath}: ${error.message}`);
  }
}

function requireString(object, key, label) {
  if (typeof object[key] !== "string" || object[key].trim() === "") {
    throw new Error(`${label}.${key} is required.`);
  }
}

function validateTarget(target) {
  requireString(target, "targetId", "target");
  requireString(target, "repositoryPath", "target");
  requireString(target, "branch", "target");
  requireString(target, "remote", "target");

  if (target.codexCommand !== undefined) {
    requireString(target, "codexCommand", "target");
  }

  for (const key of ["codexModel", "codexReasoningEffort", "codexServiceTier"]) {
    if (target[key] !== undefined) {
      requireString(target, key, "target");
    }
  }
}

function validateTasks(taskList) {
  requireString(taskList, "targetId", "tasks");

  if (!Array.isArray(taskList.tasks)) {
    throw new Error("tasks.tasks must be an array.");
  }

  if (taskList.tasks.length === 0) {
    throw new Error("tasks.tasks must not be empty.");
  }

  for (const [index, task] of taskList.tasks.entries()) {
    if (task.issue === undefined || task.issue === null || !Number.isInteger(Number(task.issue))) {
      throw new Error(`tasks.tasks[${index}].issue is required and must be an integer.`);
    }

    if (typeof task.type !== "string" || task.type.trim() === "") {
      throw new Error(`tasks.tasks[${index}].type is required.`);
    }

    if (!VALID_TASK_TYPES.has(task.type)) {
      throw new Error(`Unknown task type at tasks.tasks[${index}]: ${task.type}`);
    }
  }
}

function loadConfig(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    return { help: true };
  }

  const targetFile = readJsonFile(args.target, "Target");
  const taskFile = readJsonFile(args.tasks, "Task list");

  validateTarget(targetFile.data);
  validateTasks(taskFile.data);

  if (targetFile.data.targetId !== taskFile.data.targetId) {
    throw new Error(
      `targetId mismatch: target=${targetFile.data.targetId}, tasks=${taskFile.data.targetId}`
    );
  }

  return {
    target: {
      ...targetFile.data,
      repositoryPath: path.resolve(process.cwd(), targetFile.data.repositoryPath)
    },
    tasks: taskFile.data,
    targetPath: targetFile.path,
    tasksPath: taskFile.path
  };
}

module.exports = {
  VALID_TASK_TYPES,
  loadConfig,
  usage
};

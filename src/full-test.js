const fs = require("node:fs");
const path = require("node:path");
const { runCommand } = require("./process");
const { postIssueComment } = require("./github");

const WINDOWS_GIT_BASH_CANDIDATES = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\bin\\bash.exe"
];

function resolveFullTestShell(target, options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const configured = env.FULL_TEST_SHELL || target.fullTestShell;

  if (configured) {
    const shellPath = path.resolve(configured);
    if (!existsSync(shellPath)) {
      throw new Error(`FullTest shell does not exist: ${shellPath}`);
    }
    return shellPath;
  }

  const candidates = platform === "win32"
    ? WINDOWS_GIT_BASH_CANDIDATES
    : ["/bin/bash"];
  const shellPath = candidates.find((candidate) => existsSync(candidate));

  if (!shellPath) {
    throw new Error(
      "FullTest shell was not found. Set FULL_TEST_SHELL or target.fullTestShell to an absolute bash path."
    );
  }
  return shellPath;
}

function resolveFullTestScriptPath(target) {
  const repositoryPath = path.resolve(target.repositoryPath);
  const scriptPath = path.resolve(
    repositoryPath,
    target.fullTestScript || "full_test.sh"
  );
  const relativePath = path.relative(repositoryPath, scriptPath);

  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(
      `FullTest script must be inside the target repository: ${target.fullTestScript}`
    );
  }
  return scriptPath;
}

function isPathInside(repositoryPath, candidatePath) {
  const relativePath = path.relative(repositoryPath, candidatePath);
  return relativePath !== ".."
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

async function runFullTest(target, issue, logger, options = {}) {
  const execute = options.runCommand || runCommand;
  const scriptPath = resolveFullTestScriptPath(target);

  logger.line(`FullTest started at: ${new Date().toISOString()}`);
  logger.line(`FullTest issue: #${issue}`);
  logger.line(`FullTest script: ${scriptPath}`);

  if (!fs.existsSync(scriptPath)) {
    const error = new Error(`FullTest script does not exist: ${scriptPath}`);
    logger.line(`FullTest launch error: ${error.message}`);
    logger.line(`FullTest ended at: ${new Date().toISOString()}`);
    throw error;
  }

  if (!fs.statSync(scriptPath).isFile()) {
    const error = new Error(`FullTest script is not a file: ${scriptPath}`);
    logger.line(`FullTest launch error: ${error.message}`);
    logger.line(`FullTest ended at: ${new Date().toISOString()}`);
    throw error;
  }

  const realRepositoryPath = fs.realpathSync(target.repositoryPath);
  const realScriptPath = fs.realpathSync(scriptPath);
  if (!isPathInside(realRepositoryPath, realScriptPath)) {
    const error = new Error(`FullTest script resolves outside the target repository: ${scriptPath}`);
    logger.line(`FullTest launch error: ${error.message}`);
    logger.line(`FullTest ended at: ${new Date().toISOString()}`);
    throw error;
  }

  let shellPath;
  try {
    shellPath = resolveFullTestShell(target, options);
    logger.line(`FullTest shell: ${shellPath}`);
    logger.line(`FullTest working directory: ${target.repositoryPath}`);

    const result = await execute(shellPath, [scriptPath], {
      cwd: target.repositoryPath,
      echo: true
    });

    logger.line(`FullTest exit code: ${result.code}`);
    logger.line(`FullTest ended at: ${new Date().toISOString()}`);
    if (result.code !== 0) {
      const error = new Error(`FullTest failed for #${issue} with exit code ${result.code}`);
      error.result = result;
      throw error;
    }
    return result;
  } catch (error) {
    if (!error.result) {
      logger.line(`FullTest launch error: ${error.message}`);
      logger.line(`FullTest ended at: ${new Date().toISOString()}`);
    }
    throw error;
  }
}

function buildFullTestFailureComment(target, issue, error, executedAt = new Date()) {
  const exitCode = error.result && Number.isInteger(error.result.code)
    ? String(error.result.code)
    : "unknown";
  const testResult = exitCode === "unknown" ? "ERROR" : "FAILED";
  const details = exitCode === "unknown"
    ? "FullTest process could not be started. See local Orchestrator logs"
    : "See local FullTest logs";

  return [
    "[Orchestrator] FullTest failed",
    "Task-Type: FullTest",
    `Test-Result: ${testResult}`,
    `Issue: #${issue}`,
    `Branch: ${target.branch}`,
    `Exit-Code: ${exitCode}`,
    `Executed-At: ${executedAt.toISOString()}`,
    `Details: ${details}`
  ].join("\n");
}

async function runFullTestTask(target, issue, logger, options = {}) {
  const executeFullTest = options.runFullTest || runFullTest;
  const notifyIssue = options.postIssueComment || postIssueComment;
  const now = options.now || (() => new Date());

  try {
    return await executeFullTest(target, issue, logger, options.fullTestOptions);
  } catch (fullTestError) {
    const body = buildFullTestFailureComment(target, issue, fullTestError, now());
    logger.line(`FullTest failure notification: attempting for Issue #${issue}`);
    try {
      await notifyIssue(target.repositoryPath, issue, body);
      logger.line(`FullTest failure notification: posted to Issue #${issue}`);
    } catch (notificationError) {
      logger.line(`FullTest failure notification: FAILED for Issue #${issue}`);
      logger.line(`FullTest notification error: ${notificationError.message}`);
    }
    throw fullTestError;
  }
}

module.exports = {
  WINDOWS_GIT_BASH_CANDIDATES,
  buildFullTestFailureComment,
  resolveFullTestScriptPath,
  resolveFullTestShell,
  runFullTest,
  runFullTestTask
};

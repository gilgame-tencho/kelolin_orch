const fs = require("node:fs");
const path = require("node:path");
const { runCommand } = require("./process");

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

async function runFullTest(target, issue, logger, options = {}) {
  const execute = options.runCommand || runCommand;
  const scriptPath = path.join(target.repositoryPath, "full_test.sh");

  logger.line(`FullTest started at: ${new Date().toISOString()}`);
  logger.line(`FullTest issue: #${issue}`);
  logger.line(`FullTest script: ${scriptPath}`);

  if (!fs.existsSync(scriptPath)) {
    const error = new Error(`FullTest script does not exist: ${scriptPath}`);
    logger.line(`FullTest launch error: ${error.message}`);
    logger.line(`FullTest ended at: ${new Date().toISOString()}`);
    throw error;
  }

  let shellPath;
  try {
    shellPath = resolveFullTestShell(target, options);
    logger.line(`FullTest shell: ${shellPath}`);
    logger.line(`FullTest working directory: ${target.repositoryPath}`);

    const result = await execute(shellPath, ["./full_test.sh"], {
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

module.exports = {
  WINDOWS_GIT_BASH_CANDIDATES,
  resolveFullTestShell,
  runFullTest
};

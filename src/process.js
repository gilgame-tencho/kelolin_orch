const { spawn } = require("node:child_process");

function runCommand(command, args, options = {}) {
  const {
    cwd,
    input,
    env,
    onStdout,
    onStderr,
    echo = false
  } = options;

  return new Promise((resolve, reject) => {
    let child;

    try {
      child = spawn(command, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (echo) {
        process.stdout.write(text);
      }
      if (onStdout) {
        onStdout(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (echo) {
        process.stderr.write(text);
      }
      if (onStderr) {
        onStderr(text);
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code, signal) => {
      resolve({ command, args, cwd, code, signal, stdout, stderr });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function runChecked(command, args, options = {}) {
  const result = await runCommand(command, args, options);
  if (result.code !== 0) {
    const rendered = [command, ...args].join(" ");
    const error = new Error(`Command failed (${result.code}): ${rendered}`);
    error.result = result;
    throw error;
  }
  return result;
}

module.exports = {
  runCommand,
  runChecked
};

const fs = require("node:fs");
const path = require("node:path");
const { runCommand } = require("./process");

function buildPrompt(type, issue) {
  const promptPath = path.resolve(process.cwd(), "prompts", `${type}.txt`);

  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt template does not exist: ${promptPath}`);
  }

  const template = fs.readFileSync(promptPath, "utf8");
  return {
    promptPath,
    prompt: template.replace(/\{issue\}/g, String(issue))
  };
}

function codexCommandCandidates(target) {
  const configured = process.env.CODEX_COMMAND || target.codexCommand;
  if (configured) {
    return [configured];
  }

  if (process.platform === "win32") {
    return ["codex.exe", "codex.cmd", "codex"];
  }

  return ["codex"];
}

async function runCodex(target, prompt, logger) {
  logger.line("Starting codex exec...");
  const candidates = codexCommandCandidates(target);
  let lastError = null;

  for (const command of candidates) {
    try {
      logger.line(`Codex command: ${command}`);
      return await runCommand(command, ["exec", prompt], {
        cwd: target.repositoryPath,
        echo: true,
        onStdout: (text) => logger.appendRaw(text),
        onStderr: (text) => logger.appendRaw(text)
      });
    } catch (error) {
      lastError = error;
      if (error.code !== "ENOENT") {
        throw error;
      }
      logger.line(`Codex command not found: ${command}`);
    }
  }

  const message = [
    "Codex CLI was not found.",
    "Set CODEX_COMMAND or target.codexCommand to the full codex executable path.",
    `Tried: ${candidates.join(", ")}`
  ].join(" ");
  const error = new Error(message);
  error.cause = lastError;
  throw error;
}

module.exports = {
  buildPrompt,
  codexCommandCandidates,
  runCodex
};

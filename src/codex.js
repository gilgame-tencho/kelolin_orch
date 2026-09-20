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
  const pathCommands = process.platform === "win32"
    ? ["codex.exe", "codex.cmd", "codex"]
    : ["codex"];

  if (!configured) {
    return pathCommands;
  }

  return [configured, ...pathCommands.filter((command) => command !== configured)];
}

async function runCodex(target, prompt, logger) {
  logger.line("Starting codex exec...");
  const candidates = codexCommandCandidates(target);
  let lastError = null;

  for (const command of candidates) {
    try {
      logger.line(`Codex command: ${command}`);
      return await runCommand(command, ["exec", "--json",  prompt], {
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
    "Set CODEX_COMMAND or target.codexCommand to a valid codex command.",
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

function parseCodexUsage(stdout) {
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0
  };

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let event;

    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type !== "turn.completed" || !event.usage) {
      continue;
    }

    usage.inputTokens += event.usage.input_tokens || 0;
    usage.cachedInputTokens += event.usage.cached_input_tokens || 0;
    usage.outputTokens += event.usage.output_tokens || 0;
    usage.reasoningOutputTokens += event.usage.reasoning_output_tokens || 0;
  }

  return usage;
}
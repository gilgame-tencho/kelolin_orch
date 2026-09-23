const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runCommand } = require("./process");

const CODEX_SETTING_KEYS = {
  model: "model",
  reasoningEffort: "model_reasoning_effort",
  serviceTier: "service_tier"
};

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

function parseCodexSettings(text) {
  const settings = {};
  let section = "";

  for (const line of text.split(/\r?\n/)) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    if (section !== "" && section !== "models.new_thread") {
      continue;
    }

    const valueMatch = line.match(/^\s*(model|model_reasoning_effort|service_tier)\s*=\s*(["'])(.*?)\2\s*(?:#.*)?$/);
    if (!valueMatch) {
      continue;
    }

    const key = Object.entries(CODEX_SETTING_KEYS)
      .find(([, configKey]) => configKey === valueMatch[1])?.[0];
    if (key) {
      settings[key] = valueMatch[3];
    }
  }

  return settings;
}

function readCodexSettings(configPath) {
  try {
    return parseCodexSettings(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    return {};
  }
}

function codexHome(env = process.env) {
  if (env.CODEX_HOME) {
    return env.CODEX_HOME;
  }

  const home = env.HOME || env.USERPROFILE;
  if (home) {
    return path.join(home, ".codex");
  }

  try {
    return path.join(os.homedir(), ".codex");
  } catch {
    return null;
  }
}

function resolveCodexExecutionSettings(target, env = process.env) {
  const home = codexHome(env);
  const userSettings = home
    ? readCodexSettings(path.join(home, "config.toml"))
    : {};
  const projectSettings = readCodexSettings(
    path.join(target.repositoryPath, ".codex", "config.toml")
  );

  return {
    model: target.codexModel || projectSettings.model || userSettings.model || "unknown",
    reasoningEffort: target.codexReasoningEffort
      || projectSettings.reasoningEffort
      || userSettings.reasoningEffort
      || "unknown",
    serviceTier: target.codexServiceTier
      || projectSettings.serviceTier
      || userSettings.serviceTier
      || "unknown"
  };
}

function codexExecArgs(settings, prompt) {
  const args = ["exec", "--json", "--ephemeral"];

  if (settings.model !== "unknown") {
    args.push("--model", settings.model);
  }
  if (settings.reasoningEffort !== "unknown") {
    args.push("--config", `model_reasoning_effort=${JSON.stringify(settings.reasoningEffort)}`);
  }
  if (settings.serviceTier !== "unknown") {
    args.push("--config", `service_tier=${JSON.stringify(settings.serviceTier)}`);
  }

  args.push(prompt);
  return args;
}

function logCodexExecutionSettings(logger, settings) {
  logger.line(`Codex model: ${settings.model}`);
  logger.line(`Reasoning effort: ${settings.reasoningEffort}`);
  logger.line(`Service tier: ${settings.serviceTier}`);
}

async function runCodex(target, prompt, logger, settings = resolveCodexExecutionSettings(target)) {
  logger.line("Starting codex exec...");
  const candidates = codexCommandCandidates(target);
  const args = codexExecArgs(settings, prompt);
  let lastError = null;

  for (const command of candidates) {
    try {
      logger.line(`Codex command: ${command}`);
      return await runCommand(command, args, {
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

function parseCodexUsage(stdout) {
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
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
    usage.cacheWriteInputTokens += event.usage.cache_write_input_tokens || 0;
    usage.outputTokens += event.usage.output_tokens || 0;
    usage.reasoningOutputTokens += event.usage.reasoning_output_tokens || 0;
  }

  return usage;
}

module.exports = {
  buildPrompt,
  codexCommandCandidates,
  parseCodexSettings,
  resolveCodexExecutionSettings,
  codexExecArgs,
  logCodexExecutionSettings,
  runCodex,
  parseCodexUsage
};

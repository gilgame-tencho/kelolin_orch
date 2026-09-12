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

async function runCodex(repositoryPath, prompt, logger) {
  logger.line("Starting codex exec...");
  return runCommand("codex", ["exec", prompt], {
    cwd: repositoryPath,
    echo: true,
    onStdout: (text) => logger.appendRaw(text),
    onStderr: (text) => logger.appendRaw(text)
  });
}

module.exports = {
  buildPrompt,
  runCodex
};

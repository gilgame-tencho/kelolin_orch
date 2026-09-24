#!/usr/bin/env node

const { loadConfig, usage } = require("./config");
const { createLogger } = require("./logger");
const { verifyRepository, verifyCommitOnRemote } = require("./git");
const { getCompletedIssueComment } = require("./github");
const {
  buildPrompt,
  resolveCodexExecutionSettings,
  logCodexExecutionSettings,
  runCodex,
  parseCodexUsage
} = require("./codex");
const {
  readOwnerSignal,
  OWNER_SIGNAL_PATH
} = require("./owner-signal");

async function runTask({ target, task, index, total, logger }) {
  const issue = Number(task.issue);

  logger.line("");
  logger.line(`[Task ${index + 1}/${total}]`);
  logger.line(`Issue: #${issue}`);
  logger.line(`Type: ${task.type}`);
  logger.line(`Task started at: ${new Date().toISOString()}`);

  const codexSettings = resolveCodexExecutionSettings(target);
  logCodexExecutionSettings(logger, codexSettings);

  const { promptPath, prompt } = buildPrompt(task.type, issue);
  logger.line(`Prompt template: ${promptPath}`);

  const codexResult = await runCodex(target, prompt, logger, codexSettings);
  logger.line("");
  logger.line(`Codex exit code: ${codexResult.code}`);
  logger.line(`Task codex process ended at: ${new Date().toISOString()}`);

  let tokenUsage = null;
  try {
    tokenUsage = parseCodexUsage(codexResult.stdout);
  } catch (error) {
    logger.line(`Token Usage: unavailable (${error.message})`);
  }

  if (tokenUsage) {
    const uncachedInputTokens = tokenUsage.inputTokens - tokenUsage.cachedInputTokens;  

    logger.line("Token Usage:");
    logger.line(`  Input tokens: ${tokenUsage.inputTokens}`);
    logger.line(`  Cached input tokens: ${tokenUsage.cachedInputTokens}`);
    logger.line(`  Uncached input tokens: ${uncachedInputTokens}`);
    logger.line(`  Cache write input tokens: ${tokenUsage.cacheWriteInputTokens}`);
    logger.line(`  Output tokens: ${tokenUsage.outputTokens}`);
    logger.line(`  Reasoning output tokens: ${tokenUsage.reasoningOutputTokens}`);
  }

  // logger.block("codex stdout", codexResult.stdout);
  // logger.block("codex stderr", codexResult.stderr);

  if (codexResult.code !== 0) {
    throw new Error(`codex exec failed for #${issue} with exit code ${codexResult.code}`);
  }

  const completedComment = await getCompletedIssueComment(target.repositoryPath, issue);
  if (!completedComment) {
    logger.line("Issue completed comment: NOT FOUND");
    throw new Error(`Status: COMPLETED comment with Commit was not found for #${issue}`);
  }

  logger.line("Issue completed comment: found");
  logger.line(`Commit: ${completedComment.commitId}`);

  if (!completedComment.commitId) {
    throw new Error(`Commit ID could not be extracted for #${issue}`);
  }

  const remoteCommit = await verifyCommitOnRemote(target, completedComment.commitId);
  logger.line(`Remote branches containing commit: ${remoteCommit.branches.join(", ") || "(none)"}`);

  if (!remoteCommit.found) {
    logger.line("Remote commit: NOT FOUND");
    throw new Error(`commit ${completedComment.commitId} was not found on remote ${target.remote}`);
  }

  logger.line("Remote commit: found");
  logger.line("Result: SUCCESS");
  logger.line(`Task ended at: ${new Date().toISOString()}`);
}

async function main() {
  const config = loadConfig(process.argv.slice(2));

  if (config.help) {
    console.log(usage());
    return 0;
  }

  const logger = createLogger(config.target.targetId, config.tasksPath);
  const total = config.tasks.tasks.length;
  let completed = 0;

  logger.line("Orchestrator started");
  logger.line(`Started at: ${new Date().toISOString()}`);
  logger.line(`Target: ${config.target.targetId}`);
  logger.line(`Target config: ${config.targetPath}`);
  logger.line(`Task list: ${config.tasksPath}`);
  logger.line(`Repository Path: ${config.target.repositoryPath}`);
  logger.line(`Branch: ${config.target.branch}`);
  logger.line(`Remote: ${config.target.remote}`);
  logger.line(`Tasks: ${total}`);

  try {
    logger.line("");
    logger.line("Verifying repository...");
    await verifyRepository(config.target);
    logger.line("Repository verification: OK");

    for (const [index, task] of config.tasks.tasks.entries()) {

      const beforeTaskSignal = readOwnerSignal();

      if (beforeTaskSignal === "stop") {
        logger.line("");
        logger.line("Owner signal: stop");
        logger.line("Next task was not started.");
        logger.line(`${completed} / ${total} tasks completed.`);
        return 0;
      }
      
      await runTask({
        target: config.target,
        task,
        index,
        total,
        logger
      });
      completed += 1;
    }

    logger.line("");
    logger.line("Orchestrator completed successfully.");
    logger.line(`${completed} / ${total} tasks completed.`);
    logger.line(`Log file: ${logger.logPath}`);
    return 0;
  } catch (error) {
    logger.error("");
    logger.error("Orchestrator aborted.");
    logger.error(`Completed: ${completed} / ${total}`);
    logger.error(`Reason: ${error.message}`);

    if (error.result) {
      logger.error(`Command: ${[error.result.command, ...error.result.args].join(" ")}`);
      logger.error(`Exit Code: ${error.result.code}`);
      if (error.result.stderr) {
        logger.block("stderr", error.result.stderr);
      }
    }

    logger.error(`Log file: ${logger.logPath}`);
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

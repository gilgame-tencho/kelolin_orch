const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SLACK_CONFIG_PATH = path.resolve(
  process.cwd(),
  "keys",
  "slack.json"
);

function loadSlackConfig(configPath = DEFAULT_SLACK_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Slack config file does not exist: ${configPath}`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Slack config file is not valid JSON: ${configPath}: ${error.message}`
    );
  }

  if (
    typeof config.webhookUrl !== "string" ||
    config.webhookUrl.trim() === ""
  ) {
    throw new Error("Slack config webhookUrl is required.");
  }

  return config;
}

async function notifySlack(
  message,
  logger,
  configPath = DEFAULT_SLACK_CONFIG_PATH
) {
  try {
    const config = loadSlackConfig(configPath);

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: message
      })
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );
    }

    logger.line("Slack notification: sent");
    return true;
  } catch (error) {
    // Slack通知失敗によってOrchestratorの実行結果は変更しない
    logger.error(
      `Slack notification: failed (${error.message})`
    );
    return false;
  }
}

function buildSlackMessage({
  status,
  targetId,
  branch,
  total,
  completed,
  skipped,
  issue,
  reason,
  logPath
}) {
  const icons = {
    SUCCESS: "✅",
    FAILED: "❌",
    STOPPED: "⏹️"
  };

  const lines = [
    `${icons[status] || "ℹ️"} Orchestrator ${status}`,
    `Target: ${targetId}`,
    `Branch: ${branch}`,
    `Tasks: ${completed} completed / ${skipped} skipped / ${total} total`
  ];

  if (issue !== undefined && issue !== null) {
    lines.push(`Issue: #${issue}`);
  }

  if (reason) {
    lines.push(`Reason: ${reason}`);
  }

  if (logPath) {
    lines.push(`Log: ${logPath}`);
  }

  return lines.join("\n");
}

module.exports = {
  DEFAULT_SLACK_CONFIG_PATH,
  loadSlackConfig,
  notifySlack,
  buildSlackMessage
};

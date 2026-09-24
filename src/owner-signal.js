const fs = require("node:fs");
const path = require("node:path");

const OWNER_SIGNAL_PATH = path.resolve(
  process.cwd(),
  "config",
  "owner-signal.json"
);

function readOwnerSignal() {
  const text = fs.readFileSync(OWNER_SIGNAL_PATH, "utf8");
  const data = JSON.parse(text);

  if (data.owner_signal !== "run" && data.owner_signal !== "stop") {
    throw new Error(
      `Invalid owner_signal: ${data.owner_signal}`
    );
  }

  return data.owner_signal;
}

module.exports = {
  readOwnerSignal,
  OWNER_SIGNAL_PATH
};

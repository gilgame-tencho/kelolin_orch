const fs = require("node:fs");
const path = require("node:path");

function pad(value) {
  return String(value).padStart(2, "0");
}

function timestampForFile(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function sanitizeFilePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
}

class Logger {
  constructor(logPath) {
    this.logPath = logPath;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }

  line(message = "") {
    const text = `${message}\n`;
    fs.appendFileSync(this.logPath, text, "utf8");
    console.log(message);
  }

  error(message = "") {
    const text = `${message}\n`;
    fs.appendFileSync(this.logPath, text, "utf8");
    console.error(message);
  }

  block(title, body) {
    this.line(`--- ${title} ---`);
    if (body && body.length > 0) {
      fs.appendFileSync(this.logPath, `${body}\n`, "utf8");
    }
    this.line(`--- end ${title} ---`);
  }

  appendRaw(text) {
    fs.appendFileSync(this.logPath, text, "utf8");
  }
}

function createLogger(targetId, tasksPath) {
  const tasksName = sanitizeFilePart(path.basename(tasksPath, path.extname(tasksPath)));
  const fileName = `${timestampForFile()}_${sanitizeFilePart(targetId)}_${tasksName}.log`;
  return new Logger(path.resolve(process.cwd(), "logs", fileName));
}

module.exports = {
  createLogger,
  timestampForFile
};

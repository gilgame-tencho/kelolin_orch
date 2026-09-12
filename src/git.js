const fs = require("node:fs");
const { runChecked } = require("./process");

async function verifyRepository(target) {
  if (!fs.existsSync(target.repositoryPath)) {
    throw new Error(`Repository path does not exist: ${target.repositoryPath}`);
  }

  const inside = await runChecked("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: target.repositoryPath
  });

  if (inside.stdout.trim() !== "true") {
    throw new Error(`Path is not inside a Git work tree: ${target.repositoryPath}`);
  }

  const branch = await runChecked("git", ["branch", "--show-current"], {
    cwd: target.repositoryPath
  });
  const currentBranch = branch.stdout.trim();

  if (currentBranch !== target.branch) {
    throw new Error(`Branch mismatch: expected ${target.branch}, actual ${currentBranch}`);
  }

  const status = await runChecked("git", ["status", "--porcelain"], {
    cwd: target.repositoryPath
  });

  if (status.stdout.trim() !== "") {
    throw new Error(`Working tree is not clean:\n${status.stdout}`);
  }
}

async function verifyCommitOnRemote(target, commitId) {
  await runChecked("git", ["fetch", target.remote], {
    cwd: target.repositoryPath
  });

  const result = await runChecked("git", ["branch", "-r", "--contains", commitId], {
    cwd: target.repositoryPath
  });

  const remotePrefix = `${target.remote}/`;
  const branches = result.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/^\*\s*/, "").trim())
    .filter(Boolean);

  return {
    found: branches.some((branch) => branch.startsWith(remotePrefix)),
    branches
  };
}

module.exports = {
  verifyRepository,
  verifyCommitOnRemote
};

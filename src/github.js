const { runChecked } = require("./process");

function normalizeComments(payload) {
  if (Array.isArray(payload.comments)) {
    return payload.comments;
  }

  if (payload.comments && Array.isArray(payload.comments.nodes)) {
    return payload.comments.nodes;
  }

  return [];
}

function findLatestCompletedComment(comments) {
  const completed = comments
    .map((comment, index) => ({ ...comment, index }))
    .filter((comment) => typeof comment.body === "string" && comment.body.includes("Status: COMPLETED"))
    .filter((comment) => /Commit:\s*([0-9a-fA-F]{7,40})/.test(comment.body));

  if (completed.length === 0) {
    return null;
  }

  completed.sort((a, b) => {
    const aTime = Date.parse(a.createdAt || a.updatedAt || "");
    const bTime = Date.parse(b.createdAt || b.updatedAt || "");

    if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
      return a.index - b.index;
    }
    if (Number.isNaN(aTime)) {
      return -1;
    }
    if (Number.isNaN(bTime)) {
      return 1;
    }
    return aTime - bTime;
  });

  const latest = completed[completed.length - 1];
  const match = latest.body.match(/Commit:\s*([0-9a-fA-F]{7,40})/);

  return {
    body: latest.body,
    createdAt: latest.createdAt,
    commitId: match ? match[1] : null
  };
}

async function getCompletedIssueComment(repositoryPath, issue) {
  const result = await runChecked("gh", ["issue", "view", String(issue), "--json", "comments"], {
    cwd: repositoryPath
  });

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Failed to parse gh issue response for #${issue}: ${error.message}`);
  }

  return findLatestCompletedComment(normalizeComments(payload));
}

module.exports = {
  findLatestCompletedComment,
  getCompletedIssueComment
};

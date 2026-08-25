import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN || "";
const username = process.env.GH_USERNAME || "AbarnaaSree";
const readmePath = process.env.README_PATH || "README.md";
const maxPRs = Number(process.env.MAX_PRS || 10);

const START_MARKER = "<!--START_OPEN_SOURCE_CONTRIBUTIONS-->";
const END_MARKER = "<!--END_OPEN_SOURCE_CONTRIBUTIONS-->";

async function githubFetch(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AbarnaaSree-profile-updater",
  };

  // Token is optional.
  // GitHub Actions will automatically provide it through GITHUB_TOKEN.
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `GitHub API returned ${response.status}: ${text}`
    );
  }

  return response.json();
}

/**
 * Fetch ALL PRs created by the user.
 *
 * Uses GitHub Search API pagination.
 */
async function fetchPullRequests() {
  console.log("Fetching pull requests from GitHub...");
  console.log(`Query: is:pr author:${username}`);

  const allPRs = [];

  for (let page = 1; page <= 10; page++) {
    const query = encodeURIComponent(
      `is:pr author:${username}`
    );

    const url =
      `https://api.github.com/search/issues` +
      `?q=${query}` +
      `&sort=updated` +
      `&order=desc` +
      `&per_page=100` +
      `&page=${page}`;

    const data = await githubFetch(url);

    const items = data.items || [];

    allPRs.push(...items);

    console.log(
      `Page ${page}: ${items.length} PR(s)`
    );

    if (
      items.length < 100 ||
      allPRs.length >= data.total_count
    ) {
      break;
    }
  }

  console.log(
    `GitHub search returned ${allPRs.length} pull request(s).`
  );

  return allPRs;
}

/**
 * Extract owner/repository from repository_url.
 *
 * Example:
 * https://api.github.com/repos/floci-io/floci
 *
 * => floci-io/floci
 */
function getRepository(pr) {
  if (pr.repository_url) {
    const match = pr.repository_url.match(
      /\/repos\/([^/]+\/[^/]+)$/
    );

    if (match) {
      return match[1];
    }
  }

  return "GitHub";
}

/**
 * Determine PR status.
 */
function getStatus(pr) {
  if (pr.pull_request?.merged_at) {
    return {
      label: "MERGED",
      emoji: "🟢",
    };
  }

  if (pr.state === "open") {
    return {
      label: "OPEN",
      emoji: "🔵",
    };
  }

  return {
    label: "CLOSED",
    emoji: "⚪",
  };
}

/**
 * Escape HTML so PR titles cannot break README HTML.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert GitHub date to Indian date format.
 */
function formatDate(date) {
  if (!date) {
    return "Unknown";
  }

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Calculate PR statistics.
 */
function calculateStats(prs) {
  const total = prs.length;

  const merged = prs.filter(
    (pr) => Boolean(pr.pull_request?.merged_at)
  ).length;

  const open = prs.filter(
    (pr) => pr.state === "open"
  ).length;

  const closed = prs.filter(
    (pr) =>
      pr.state === "closed" &&
      !pr.pull_request?.merged_at
  ).length;

  return {
    total,
    merged,
    open,
    closed,
  };
}

/**
 * Sort PRs by latest relevant date.
 */
function sortPullRequests(prs) {
  return [...prs].sort((a, b) => {
    const dateA = new Date(
      a.pull_request?.merged_at ||
        a.updated_at ||
        a.created_at
    );

    const dateB = new Date(
      b.pull_request?.merged_at ||
        b.updated_at ||
        b.created_at
    );

    return dateB - dateA;
  });
}

/**
 * Build one PR row.
 */
function buildPRRow(pr) {
  const repository = escapeHtml(
    getRepository(pr)
  );

  const title = escapeHtml(
    pr.title || "Untitled Pull Request"
  );

  const status = getStatus(pr);

  const date = formatDate(
    pr.pull_request?.merged_at ||
      pr.updated_at ||
      pr.created_at
  );

  const url = pr.html_url;

  return `
<tr>
<td align="center" width="70">
<strong>${status.emoji}</strong>
</td>

<td>
<strong>${title}</strong>
<br>

<sub>
📦 ${repository}
&nbsp;&nbsp;•&nbsp;&nbsp;
🔀 PR #${pr.number}
&nbsp;&nbsp;•&nbsp;&nbsp;
${status.emoji} ${status.label}
&nbsp;&nbsp;•&nbsp;&nbsp;
🗓️ ${date}
</sub>
</td>

<td align="center" width="130">

<a href="${url}">
<img
src="https://img.shields.io/badge/VIEW_PR-FF2E9E?style=for-the-badge&logo=github&logoColor=white"
alt="View Pull Request"
/>
</a>

</td>
</tr>
`;
}

/**
 * Build complete automatically generated section.
 */
function buildMarkdown(prs) {
  const stats = calculateStats(prs);

  const sortedPRs = sortPullRequests(prs);

  const displayedPRs = sortedPRs.slice(
    0,
    maxPRs
  );

  if (sortedPRs.length === 0) {
    return `
<div align="center">

## ⚡ Open Source Contributions

<sub>
No pull requests found for <strong>${escapeHtml(username)}</strong>.
</sub>

</div>
`;
  }

  const rows = displayedPRs
    .map(buildPRRow)
    .join("\n");

  return `
<div align="center">

## ⚡ Open Source Contributions

<sub>
Pull requests created by <strong>${escapeHtml(username)}</strong>,
automatically synced from GitHub.
</sub>

<br><br>

<table>

<tr>

<td align="center">
<strong>🔀 ${stats.total}</strong>
<br>
<sub>Total PRs</sub>
</td>

<td align="center">
<strong>🟢 ${stats.merged}</strong>
<br>
<sub>Merged</sub>
</td>

<td align="center">
<strong>🔵 ${stats.open}</strong>
<br>
<sub>Open</sub>
</td>

<td align="center">
<strong>⚪ ${stats.closed}</strong>
<br>
<sub>Closed</sub>
</td>

</tr>

</table>

</div>

<br>

### 🔀 My Pull Requests

<table width="100%">

${rows}

</table>

<br>

<div align="center">

<sub>

Showing latest ${displayedPRs.length} of ${stats.total} pull requests

&nbsp; • &nbsp;

🔄 Automatically updated every 6 hours

&nbsp; • &nbsp;

⚡ GitHub Actions

</sub>

</div>
`;
}

/**
 * Replace ONLY the content between the
 * Open Source Contributions markers.
 */
function updateReadme(markdown) {
  const original = readFileSync(
    readmePath,
    "utf8"
  );

  const startIndex =
    original.indexOf(START_MARKER);

  const endIndex =
    original.indexOf(END_MARKER);

  if (startIndex === -1) {
    throw new Error(
      `README is missing start marker:\n${START_MARKER}`
    );
  }

  if (endIndex === -1) {
    throw new Error(
      `README is missing end marker:\n${END_MARKER}`
    );
  }

  if (endIndex < startIndex) {
    throw new Error(
      "README markers are in the wrong order."
    );
  }

  const before = original.slice(
    0,
    startIndex
  );

  const after = original.slice(
    endIndex + END_MARKER.length
  );

  const replacement =
    `${START_MARKER}\n` +
    `${markdown.trim()}\n` +
    `${END_MARKER}`;

  const updated =
    before +
    replacement +
    after;

  if (updated === original) {
    console.log(
      "README is already up to date."
    );

    return;
  }

  writeFileSync(
    readmePath,
    updated,
    "utf8"
  );

  console.log(
    "README updated successfully."
  );
}

/**
 * Main.
 */
async function main() {
  console.log(
    `Updating pull requests for ${username}...`
  );

  console.log("");

  const prs = await fetchPullRequests();

  const stats = calculateStats(prs);

  console.log("");
  console.log(
    "📊 Pull Request Statistics"
  );

  console.log(`Total  : ${stats.total}`);
  console.log(`Merged : ${stats.merged}`);
  console.log(`Open   : ${stats.open}`);
  console.log(`Closed : ${stats.closed}`);

  console.log("");

  const markdown = buildMarkdown(prs);

  updateReadme(markdown);

  console.log("");
  console.log(
    "✅ GitHub profile PR section synchronized."
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "❌ Failed to update pull requests"
  );
  console.error(error);

  process.exit(1);
});

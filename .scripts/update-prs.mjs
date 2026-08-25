import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GH_USERNAME || "AbarnaaSree";
const readmePath = process.env.README_PATH || "README.md";
const maxPRs = Number(process.env.MAX_PRS || 10);

const START_MARKER = "<!--START_MERGED_PRS-->";
const END_MARKER = "<!--END_MERGED_PRS-->";

async function githubFetch(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AbarnaaSree-profile-updater",
  };

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

async function fetchPullRequests() {
  const query = encodeURIComponent(
    `is:pr author:${username}`
  );

  const searchUrl =
    `https://api.github.com/search/issues?q=${query}` +
    `&sort=updated&order=desc&per_page=100`;

  console.log("Fetching pull requests from GitHub...");
  console.log(`Query: is:pr author:${username}`);

  const data = await githubFetch(searchUrl);

  console.log(
    `GitHub search returned ${data.total_count || 0} pull request(s).`
  );

  const prs = await Promise.all(
    (data.items || []).map(async (pr) => {
      if (!pr.pull_request?.url) {
        return null;
      }

      try {
        const details = await githubFetch(pr.pull_request.url);

        return {
          ...pr,
          ...details,
        };
      } catch (error) {
        console.warn(
          `Could not fetch details for PR #${pr.number}: ${error.message}`
        );

        return null;
      }
    })
  );

  return prs.filter(Boolean);
}

function getRepository(pr) {
  const match = pr.repository_url?.match(
    /repos\/([^/]+\/[^/]+)$/
  );

  return match ? match[1] : "GitHub";
}

function getStatus(pr) {
  if (pr.merged_at) {
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function calculateStats(prs) {
  const total = prs.length;

  const merged = prs.filter(
    (pr) => Boolean(pr.merged_at)
  ).length;

  const open = prs.filter(
    (pr) => pr.state === "open"
  ).length;

  const closed = prs.filter(
    (pr) => pr.state === "closed" && !pr.merged_at
  ).length;

  return {
    total,
    merged,
    open,
    closed,
  };
}

function buildMarkdown(prs) {
  const stats = calculateStats(prs);

  const sortedPRs = [...prs]
    .sort((a, b) => {
      const dateA = new Date(
        a.merged_at ||
          a.updated_at ||
          a.created_at
      );

      const dateB = new Date(
        b.merged_at ||
          b.updated_at ||
          b.created_at
      );

      return dateB - dateA;
    })
    .slice(0, maxPRs);

  const rows = sortedPRs
    .map((pr) => {
      const repository = escapeHtml(
        getRepository(pr)
      );

      const title = escapeHtml(
        pr.title || "Untitled Pull Request"
      );

      const status = getStatus(pr);

      const date = formatDate(
        pr.merged_at ||
          pr.updated_at ||
          pr.created_at
      );

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
<a href="${pr.html_url}">
<img
src="https://img.shields.io/badge/VIEW_PR-FF2E9E?style=for-the-badge&logo=github&logoColor=white"
alt="View Pull Request"
/>
</a>
</td>
</tr>
`;
    })
    .join("\n");

  if (sortedPRs.length === 0) {
    return `
<div align="center">

## ⚡ Open Source Contributions

No pull requests found for **${username}**.

</div>
`;
  }

  return `
<div align="center">

## ⚡ Open Source Contributions

<sub>
Pull requests created by <strong>${username}</strong>,
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
Showing latest ${sortedPRs.length} of ${stats.total} pull requests
&nbsp; • &nbsp;
🔄 Automatically updated every 6 hours
&nbsp; • &nbsp;
⚡ GitHub Actions
</sub>
</div>
`;
}

function updateReadme(markdown) {
  const original = readFileSync(
    readmePath,
    "utf8"
  );

  if (
    !original.includes(START_MARKER) ||
    !original.includes(END_MARKER)
  ) {
    throw new Error(
      `README.md must contain both markers:

${START_MARKER}

${END_MARKER}`
    );
  }

  const pattern = new RegExp(
    `${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`
  );

  const replacement =
    `${START_MARKER}\n${markdown}\n${END_MARKER}`;

  const updated = original.replace(
    pattern,
    replacement
  );

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

async function main() {
  console.log(
    `Updating pull requests for ${username}...`
  );

  const prs = await fetchPullRequests();

  const stats = calculateStats(prs);

  console.log("");
  console.log("📊 Pull Request Statistics");
  console.log(`Total  : ${stats.total}`);
  console.log(`Merged : ${stats.merged}`);
  console.log(`Open   : ${stats.open}`);
  console.log(`Closed : ${stats.closed}`);
  console.log("");

  const markdown = buildMarkdown(prs);

  updateReadme(markdown);
}

main().catch((error) => {
  console.error("");
  console.error(
    "❌ Failed to update pull requests"
  );
  console.error(error);
  process.exit(1);
});
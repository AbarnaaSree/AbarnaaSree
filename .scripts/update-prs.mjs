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

/*
 * Fetch PRs created by the user.
 * This gives the TOTAL PR count.
 */
async function fetchAllPullRequests() {
  const query = encodeURIComponent(
    `is:pr author:${username}`
  );

  const url =
    `https://api.github.com/search/issues?q=${query}` +
    `&per_page=1`;

  const data = await githubFetch(url);

  return data.total_count || 0;
}

/*
 * Fetch ONLY merged PRs.
 */
async function fetchMergedPullRequests() {
  const query = encodeURIComponent(
    `is:pr author:${username} is:merged`
  );

  const url =
    `https://api.github.com/search/issues?q=${query}` +
    `&sort=updated&order=desc&per_page=100`;

  console.log("Fetching merged PRs from GitHub...");
  console.log(
    `Query: is:pr author:${username} is:merged`
  );

  const data = await githubFetch(url);

  const mergedPRs = await Promise.all(
    (data.items || []).map(async (pr) => {
      if (!pr.pull_request?.url) {
        return null;
      }

      try {
        const details = await githubFetch(
          pr.pull_request.url
        );

        /*
         * Extra protection:
         * Only accept PRs that actually have merged_at.
         */
        if (!details.merged_at) {
          return null;
        }

        return {
          ...pr,
          ...details,
        };
      } catch (error) {
        console.warn(
          `Could not fetch PR #${pr.number}: ${error.message}`
        );

        return null;
      }
    })
  );

  return mergedPRs.filter(Boolean);
}

function getRepository(pr) {
  const match = pr.repository_url?.match(
    /repos\/([^/]+\/[^/]+)$/
  );

  return match ? match[1] : "GitHub";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
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

function buildMarkdown(totalPRs, mergedPRs) {
  const sortedPRs = [...mergedPRs]
    .sort(
      (a, b) =>
        new Date(b.merged_at) -
        new Date(a.merged_at)
    )
    .slice(0, maxPRs);

  const mergedCount = mergedPRs.length;

  const rows = sortedPRs
    .map((pr) => {
      const repository = escapeHtml(
        getRepository(pr)
      );

      const title = escapeHtml(
        pr.title || "Untitled Pull Request"
      );

      const date = formatDate(pr.merged_at);

      return `
<tr>

<td align="center" width="60">

<strong>🟢</strong>

</td>

<td>

<strong>${title}</strong>

<br>

<sub>

📦 ${repository}

&nbsp;&nbsp;•&nbsp;&nbsp;

🔀 PR #${pr.number}

&nbsp;&nbsp;•&nbsp;&nbsp;

🟢 MERGED

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

  return `
<div align="center">

## ⚡ Open Source Contributions

<sub>
Automatically synced from GitHub.
</sub>

<br><br>

<table>

<tr>

<td align="center">

<strong>🔀 ${totalPRs}</strong>

<br>

<sub>Total PRs</sub>

</td>

<td align="center">

<strong>🟢 ${mergedCount}</strong>

<br>

<sub>Merged PRs</sub>

</td>

</tr>

</table>

</div>

<br>

### 🔀 Merged Pull Requests

<table width="100%">

${rows}

</table>

<br>

<div align="center">

<sub>

Showing latest ${sortedPRs.length} of ${mergedCount} merged PRs

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
      `README.md must contain:

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

  writeFileSync(
    readmePath,
    updated,
    "utf8"
  );

  console.log("README updated successfully.");
}

async function main() {
  console.log(
    `Updating GitHub statistics for ${username}...`
  );

  /*
   * 1. Fetch TOTAL PR count
   */
  const totalPRs = await fetchAllPullRequests();

  /*
   * 2. Fetch ONLY MERGED PRs
   */
  const mergedPRs =
    await fetchMergedPullRequests();

  console.log("");
  console.log("📊 GitHub Statistics");
  console.log(`Total PRs   : ${totalPRs}`);
  console.log(`Merged PRs  : ${mergedPRs.length}`);
  console.log("");

  /*
   * 3. Generate README section
   */
  const markdown = buildMarkdown(
    totalPRs,
    mergedPRs
  );

  /*
   * 4. Update README
   */
  updateReadme(markdown);
}

main().catch((error) => {
  console.error("");
  console.error(
    "❌ Failed to update GitHub statistics"
  );
  console.error(error);
  process.exit(1);
});

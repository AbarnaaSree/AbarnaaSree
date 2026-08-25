import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GH_USERNAME || "AbarnaaSree";
const readmePath = process.env.README_PATH || "README.md";
const maxPRs = Number(process.env.MAX_PRS || 10);

const START_MARKER = "<!--START_MERGED_PRS-->";
const END_MARKER = "<!--END_MERGED_PRS-->";

async function fetchMergedPRs() {
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set.");
  }

  const query = encodeURIComponent(
    `is:pr is:merged author:${username}`
  );

  const url =
    `https://api.github.com/search/issues?q=${query}` +
    `&sort=updated&order=desc&per_page=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-profile-readme-updater",
    },
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `GitHub API returned ${response.status}: ${text}`
    );
  }

  const data = await response.json();

  return (data.items || [])
    .filter((pr) => pr.pull_request?.merged_at)
    .sort(
      (a, b) =>
        new Date(b.pull_request.merged_at) -
        new Date(a.pull_request.merged_at)
    )
    .slice(0, maxPRs);
}

function getRepository(pr) {
  const match = pr.repository_url?.match(
    /repos\/([^/]+\/[^/]+)$/
  );

  return match?.[1] || "GitHub";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMarkdown(prs) {
  if (prs.length === 0) {
    return `
<div align="center">

### 🔄 Open Source Contributions

No merged pull requests found yet.

</div>
`;
  }

  const rows = prs
    .map((pr, index) => {
      const repository = escapeHtml(getRepository(pr));

      const title = escapeHtml(
        pr.title || "Untitled Pull Request"
      );

      const mergedDate = new Date(
        pr.pull_request.merged_at
      ).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Kolkata",
      });

      const medal =
        index === 0
          ? "🥇"
          : index === 1
          ? "🥈"
          : index === 2
          ? "🥉"
          : "◆";

      return `
<tr>
<td align="center" width="70">

<h3>${medal}</h3>

</td>

<td>

<strong>${title}</strong>

<br>

<sub>
📦 ${repository}
&nbsp; • &nbsp;
🔀 PR #${pr.number}
&nbsp; • &nbsp;
🗓️ ${mergedDate}
</sub>

</td>

<td align="center" width="120">

<a href="${pr.html_url}">
<img
src="https://img.shields.io/badge/VIEW%20PR-FF2E9E?style=for-the-badge&logo=github&logoColor=white"
alt="View PR"
/>
</a>

</td>
</tr>
`;
    })
    .join("\n");

  return `
<div align="center">

### ⚡ Recent Open Source Merges

<p>
<sub>
Latest ${prs.length} merged pull requests
</sub>
</p>

</div>

<table width="100%">
${rows}
</table>

<div align="center">

<br>

<sub>
🔄 Automatically synchronized from GitHub
&nbsp; • &nbsp;
⚡ Powered by GitHub Actions
</sub>

</div>
`;
}

function updateReadme(markdown) {
  const original = readFileSync(readmePath, "utf8");

  if (
    !original.includes(START_MARKER) ||
    !original.includes(END_MARKER)
  ) {
    throw new Error(
      `README.md must contain both ${START_MARKER} and ${END_MARKER}`
    );
  }

  const pattern = new RegExp(
    `${START_MARKER}[\\s\\S]*?${END_MARKER}`
  );

  const replacement =
    `${START_MARKER}\n${markdown}\n${END_MARKER}`;

  const updated = original.replace(
    pattern,
    replacement
  );

  if (updated === original) {
    console.log("README is already up to date.");
    return false;
  }

  writeFileSync(
    readmePath,
    updated,
    "utf8"
  );

  console.log(
    "README updated successfully."
  );

  return true;
}

async function main() {
  console.log(
    `Fetching merged PRs for ${username}...`
  );

  const prs = await fetchMergedPRs();

  console.log(
    `Found ${prs.length} merged PR(s).`
  );

  const markdown = buildMarkdown(prs);

  updateReadme(markdown);
}

main().catch((error) => {
  console.error("❌ Failed to update merged PRs:");
  console.error(error);
  process.exit(1);
});

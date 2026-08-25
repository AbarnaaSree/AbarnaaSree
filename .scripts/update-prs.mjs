import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GH_USERNAME || "AbarnaaSree";
const readmePath = process.env.README_PATH || "README.md";
const maxPRs = Number(process.env.MAX_PRS || 10);

const START_MARKER = "<!--START_MERGED_PRS-->";
const END_MARKER = "<!--END_MERGED_PRS-->";

async function fetchMergedPRs() {
  if (!token) {
    throw new Error("GITHUB_TOKEN is not available.");
  }

  const query = encodeURIComponent(
    `is:pr is:merged author:${username}`
  );

  const searchUrl =
    `https://api.github.com/search/issues?q=${query}` +
    `&sort=updated&order=desc&per_page=100`;

  console.log("Fetching merged PRs from GitHub...");
  console.log(`Query: is:pr is:merged author:${username}`);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AbarnaaSree-profile-updater",
  };

  const response = await fetch(searchUrl, {
    headers,
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `GitHub API returned ${response.status}: ${text}`
    );
  }

  const data = await response.json();

  console.log(
    `GitHub search returned ${data.items?.length || 0} PR(s).`
  );

  const prs = await Promise.all(
    (data.items || []).map(async (pr) => {
      if (!pr.pull_request?.url) {
        return null;
      }

      const detailResponse = await fetch(
        pr.pull_request.url,
        { headers }
      );

      if (!detailResponse.ok) {
        console.warn(
          `Could not fetch PR details for #${pr.number}`
        );
        return null;
      }

      const details = await detailResponse.json();

      if (!details.merged_at) {
        return null;
      }

      return {
        ...pr,
        pull_request: {
          ...pr.pull_request,
          ...details,
        },
      };
    })
  );

  return prs
    .filter(Boolean)
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

  return match ? match[1] : "GitHub";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMarkdown(prs) {
  if (prs.length === 0) {
    return `
<div align="center">

### 🌌 Open Source Contributions

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
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });

      let icon = "◆";

      if (index === 0) icon = "🥇";
      if (index === 1) icon = "🥈";
      if (index === 2) icon = "🥉";

      return `
<tr>
<td align="center" width="70">
<strong>${icon}</strong>
</td>

<td>
<strong>${title}</strong>
<br>

<sub>
📦 ${repository}
&nbsp;&nbsp;•&nbsp;&nbsp;
🔀 PR #${pr.number}
&nbsp;&nbsp;•&nbsp;&nbsp;
🗓️ ${mergedDate}
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

## ⚡ Recent Open Source Merges

<sub>
Latest ${prs.length} merged pull requests
</sub>

</div>

<br>

<table width="100%">

${rows}

</table>

<br>

<div align="center">

<sub>
🔄 Automatically updated every 6 hours
&nbsp; • &nbsp;
⚡ GitHub Actions
</sub>

</div>
`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateReadme(markdown) {
  const original = readFileSync(readmePath, "utf8");

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
    `${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(
      END_MARKER
    )}`
  );

  const replacement =
    `${START_MARKER}\n${markdown}\n${END_MARKER}`;

  const updated = original.replace(
    pattern,
    replacement
  );

  if (updated === original) {
    console.log("README is already up to date.");
    return;
  }

  writeFileSync(
    readmePath,
    updated,
    "utf8"
  );

  console.log("README updated successfully.");
}

async function main() {
  console.log(
    `Updating merged PRs for ${username}...`
  );

  const prs = await fetchMergedPRs();

  console.log(
    `Found ${prs.length} merged PR(s).`
  );

  const markdown = buildMarkdown(prs);

  updateReadme(markdown);
}

main().catch((error) => {
  console.error("");
  console.error("❌ Failed to update merged PRs");
  console.error(error);
  process.exit(1);
});
import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GH_USERNAME || "AbarnaaSree";
const readmePath = process.env.README_PATH || "README.md";
const maxPRs = Number(process.env.MAX_PRS || 20);

const START_MARKER = "<!--START_MERGED_PRS-->";
const END_MARKER = "<!--END_MERGED_PRS-->";

async function fetchMergedPRs() {
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
  // Example:
  // https://api.github.com/repos/floci-io/floci
  const match = pr.repository_url?.match(
    /repos\/([^/]+\/[^/]+)$/
  );

  return match?.[1] || "GitHub";
}

function buildMarkdown(prs) {
  if (prs.length === 0) {
    return `
<div align="center">

### 🔄 Syncing Open Source Contributions

No merged pull requests found yet.

</div>
`;
  }

  const cards = prs
    .map((pr, index) => {
      const repository = getRepository(pr);
      const mergedDate = new Date(
        pr.pull_request.merged_at
      ).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      const title = (pr.title || "")
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");

      const medal =
        index === 0
          ? "🥇"
          : index === 1
          ? "🥈"
          : index === 2
          ? "🥉"
          : "🔹";

      return `
<tr>
<td width="55">

${medal}

</td>

<td>

### [${title}](${pr.html_url})

**${repository}** · PR #${pr.number}

🗓️ Merged ${mergedDate}

</td>

<td align="right">

<a href="${pr.html_url}">
<img src="https://img.shields.io/badge/VIEW%20PR-FF69B4?style=for-the-badge&logo=github&logoColor=white"/>
</a>

</td>
</tr>
`;
    })
    .join("\n");

  return `
<table>
${cards}
</table>

<div align="center">

✨ **Automatically synchronized from GitHub**

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

  const updated = original.replace(pattern, replacement);

  if (updated === original) {
    console.log("README is already up to date.");
    return;
  }

  writeFileSync(readmePath, updated, "utf8");

  console.log("README updated successfully.");
}

async function main() {
  const prs = await fetchMergedPRs();

  console.log(
    `Found ${prs.length} merged PR(s) for ${username}.`
  );

  const markdown = buildMarkdown(prs);

  updateReadme(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

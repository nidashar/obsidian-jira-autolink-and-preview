# Jira Issue Lens

Automatically converts configured Jira Cloud issue keys into clickable links in Obsidian and shows issue details when you hover them.

- Converts a typed key (for example `ABC-12345`) to `[ABC-12345](https://your-site.atlassian.net/browse/ABC-12345)` after a space, punctuation or Enter.
- Matches project prefixes without regard to case, so typing `abc-12345` creates an `ABC-12345` link.
- Skips code blocks, inline code, frontmatter, existing link text, wikilinks and URLs.
- Hover a Jira link to see its key, status, summary, type, assignee and a truncated description.

Existing notes are not modified.

## Install (BRAT)

1. Install the BRAT community plugin.
2. In BRAT, choose **Add Beta Plugin** and enter `https://github.com/nidashar/obsidian-jira-issue-lens`.
3. Enable Jira Issue Lens.

## Install (manual)

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/nidashar-jira-issue-lens/`, then enable the plugin.

## Settings

Configure the Jira base URL and at least one project prefix before auto-linking can work. For hover previews, also provide your Atlassian email and API token.

The settings page validates the Jira URL and project prefixes as you type. Use **Test connection** to verify the Jira URL, email and API token before returning to your notes.

| Setting | Notes |
|---|---|
| Jira base URL | Required HTTPS site URL without an issue or project path, for example `https://your-site.atlassian.net` |
| Project prefixes | Required, comma separated and case insensitive, for example `ABC, XYZ` |
| Auto-link while typing | Enabled by default after the Jira URL and project prefixes are configured |
| Hover preview | Enabled by default; needs an Atlassian email and API token |
| Atlassian email, API token | Each user creates their own token in [Atlassian account settings](https://id.atlassian.com/manage-profile/security/api-tokens) |
| Cache duration | Minutes, default 10 |

The token is stored in Obsidian secret storage when available. On older Obsidian versions it falls back to plaintext in the plugin's `data.json`; never share or commit that file.

## Develop

```
npm install
npm run build   # type check + production bundle to main.js
npm run dev     # watch mode
```

Symlink or copy the repo into `<vault>/.obsidian/plugins/nidashar-jira-issue-lens/` to test.

## Release

```
npm version patch   # bumps package.json, manifest.json, versions.json
git push --follow-tags
```

The tag triggers the GitHub Action, which publishes `main.js`, `manifest.json` and `styles.css`.

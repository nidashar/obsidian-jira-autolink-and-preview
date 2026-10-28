# IFX Linker

Obsidian plugin for Jira Cloud issue keys.

- Converts a typed key (for example `IFX-12345`) to `[IFX-12345](https://your-site.atlassian.net/browse/IFX-12345)` after a space, punctuation or Enter.
- Skips code blocks, inline code, frontmatter, existing link text, wikilinks and URLs.
- Hover a Jira link to see key, status, summary, type, assignee and a truncated description.

Existing notes are not modified.

## Install (BRAT)

1. Install the BRAT community plugin.
2. BRAT: Add a beta plugin, then enter this repository's URL.
3. Enable IFX Linker.

## Install (manual)

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/ifx-linker/`, then enable the plugin.

## Settings

| Setting | Notes |
|---|---|
| Jira base URL | Default `https://collinsongroup.atlassian.net` |
| Project prefixes | Comma separated, default `IFX` |
| Auto-link while typing | On by default |
| Hover preview | Needs email and API token |
| Atlassian email, API token | Each user creates their own token at id.atlassian.com/manage-profile/security/api-tokens |
| Cache duration | Minutes, default 10 |

The token is stored in Obsidian secret storage when available. On older Obsidian versions it falls back to plaintext in the plugin's `data.json`; never share or commit that file.

## Develop

```
npm install
npm run build   # type check + production bundle to main.js
npm run dev     # watch mode
```

Symlink or copy the repo into `<vault>/.obsidian/plugins/ifx-linker/` to test.

## Release

```
npm version patch   # bumps package.json, manifest.json, versions.json
git push --follow-tags
```

The tag triggers the GitHub Action, which publishes `main.js`, `manifest.json` and `styles.css`.

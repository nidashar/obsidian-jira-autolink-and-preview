import { requestUrl } from "obsidian";
import type IfxLinkerPlugin from "./main";
import { getToken } from "./settings";

export interface IssueInfo {
  key: string;
  summary: string;
  status: string;
  type: string;
  assignee: string;
  description: string;
  url: string;
}

export type IssueResult =
  | { ok: true; issue: IssueInfo }
  | { ok: false; message: string };

interface CacheEntry {
  at: number;
  result: IssueResult;
}

const DESCRIPTION_MAX = 400;

// Flatten Atlassian Document Format to plain text.
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") {
    return n.text || "";
  }
  if (n.type === "hardBreak") {
    return "\n";
  }
  const inner = (n.content || []).map(adfToText).join("");
  const blocks = ["paragraph", "heading", "listItem", "codeBlock", "blockquote"];
  return blocks.includes(n.type || "") ? inner + "\n" : inner;
}

export class JiraClient {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<IssueResult>>();

  constructor(private plugin: IfxLinkerPlugin) {}

  clearCache(): void {
    this.cache.clear();
  }

  async getIssue(key: string): Promise<IssueResult> {
    const ttl = this.plugin.settings.cacheMinutes * 60_000;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) {
      return hit.result;
    }
    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }
    const p = this.fetchIssue(key).then((result) => {
      // Do not cache transient failures.
      if (result.ok || result.message.startsWith("Issue not found")) {
        this.cache.set(key, { at: Date.now(), result });
      }
      this.inflight.delete(key);
      return result;
    });
    this.inflight.set(key, p);
    return p;
  }

  private async fetchIssue(key: string): Promise<IssueResult> {
    const { baseUrl, email } = this.plugin.settings;
    const token = getToken(this.plugin);
    if (!baseUrl || !email || !token) {
      return { ok: false, message: "Set Jira URL, email and API token in the IFX Linker settings." };
    }
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype,assignee,description`;
    try {
      const res = await requestUrl({
        url,
        method: "GET",
        headers: {
          Authorization: "Basic " + btoa(`${email}:${token}`),
          Accept: "application/json",
        },
        throw: false,
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: "Jira rejected the credentials (check email and API token)." };
      }
      if (res.status === 404) {
        return { ok: false, message: `Issue not found: ${key}` };
      }
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, message: `Jira returned HTTP ${res.status}.` };
      }
      const f = res.json.fields || {};
      let description = adfToText(f.description).trim();
      if (description.length > DESCRIPTION_MAX) {
        description = description.slice(0, DESCRIPTION_MAX).trimEnd() + "...";
      }
      return {
        ok: true,
        issue: {
          key,
          summary: f.summary || "",
          status: f.status?.name || "",
          type: f.issuetype?.name || "",
          assignee: f.assignee?.displayName || "Unassigned",
          description,
          url: `${baseUrl}/browse/${key}`,
        },
      };
    } catch (e) {
      return { ok: false, message: "Could not reach Jira: " + (e instanceof Error ? e.message : String(e)) };
    }
  }
}

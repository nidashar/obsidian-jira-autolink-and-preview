import { requestUrl } from "obsidian";
import type JiraLinkerPlugin from "./main";
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

export type ConnectionResult =
  | { ok: true; displayName: string }
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
  private generation = 0;

  constructor(private plugin: JiraLinkerPlugin) {}

  clearCache(): void {
    this.generation++;
    this.cache.clear();
    this.inflight.clear();
  }

  async testConnection(): Promise<ConnectionResult> {
    const { baseUrl, email } = this.plugin.settings;
    const token = getToken(this.plugin);
    if (!baseUrl || !email || !token) {
      return {
        ok: false,
        message: "Enter the Jira URL, Atlassian email and API token before testing.",
      };
    }
    try {
      const res = await requestUrl({
        url: `${baseUrl}/rest/api/3/myself`,
        method: "GET",
        headers: {
          Authorization: "Basic " + btoa(`${email}:${token}`),
          Accept: "application/json",
        },
        throw: false,
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: "Jira rejected the email or API token." };
      }
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, message: `Jira returned HTTP ${res.status}. Check the site URL.` };
      }
      return { ok: true, displayName: res.json?.displayName || "" };
    } catch (error) {
      return {
        ok: false,
        message: "Could not reach Jira: " + (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  async getIssue(key: string): Promise<IssueResult> {
    const { baseUrl, email } = this.plugin.settings;
    const token = getToken(this.plugin);
    const requestKey = JSON.stringify([baseUrl, email, key]);
    const generation = this.generation;
    const ttl = this.plugin.settings.cacheMinutes * 60_000;
    const hit = this.cache.get(requestKey);
    if (hit && Date.now() - hit.at < ttl) {
      return hit.result;
    }
    const pending = this.inflight.get(requestKey);
    if (pending) {
      return pending;
    }
    const p = this.fetchIssue(key, baseUrl, email, token).then((result) => {
      // Do not cache transient failures.
      if (
        generation === this.generation &&
        (result.ok || result.message.startsWith("Issue not found"))
      ) {
        this.cache.set(requestKey, { at: Date.now(), result });
      }
      return result;
    }).finally(() => {
      if (this.inflight.get(requestKey) === p) {
        this.inflight.delete(requestKey);
      }
    });
    this.inflight.set(requestKey, p);
    return p;
  }

  private async fetchIssue(
    key: string,
    baseUrl: string,
    email: string,
    token: string
  ): Promise<IssueResult> {
    if (!baseUrl || !email || !token) {
      return { ok: false, message: "Set Jira URL, email and API token in the Jira Linker settings." };
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

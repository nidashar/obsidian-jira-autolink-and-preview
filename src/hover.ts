import { hoverTooltip, Tooltip } from "@codemirror/view";
import type IfxLinkerPlugin from "./main";
import type { IssueResult } from "./jira";
import { keyRegex } from "./autolink";
import { prefixList } from "./settings";

export function renderCard(result: IssueResult, key: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "ifx-card";
  if (!result.ok) {
    const head = el.createDiv({ cls: "ifx-card-head", text: key });
    head.setAttr("aria-label", key);
    el.createDiv({ cls: "ifx-card-error", text: result.message });
    return el;
  }
  const i = result.issue;
  const head = el.createDiv({ cls: "ifx-card-head" });
  head.createSpan({ cls: "ifx-card-key", text: i.key });
  if (i.status) {
    head.createSpan({ cls: "ifx-card-status", text: i.status });
  }
  el.createDiv({ cls: "ifx-card-summary", text: i.summary });
  el.createDiv({
    cls: "ifx-card-meta",
    text: [i.type, i.assignee].filter(Boolean).join(" | "),
  });
  if (i.description) {
    el.createDiv({ cls: "ifx-card-desc", text: i.description });
  }
  return el;
}

// Plain text for Obsidian's native tooltip (Reading view).
export function cardText(result: IssueResult, key: string): string {
  if (!result.ok) {
    return `${key}\n${result.message}`;
  }
  const i = result.issue;
  const head = [i.key, i.status && `[${i.status}]`].filter(Boolean).join(" ");
  const meta = [i.type, i.assignee].filter(Boolean).join(" | ");
  return [head, i.summary, meta, i.description].filter(Boolean).join("\n");
}

// Editor hover: finds a key under the pointer on the line.
export function editorHover(plugin: IfxLinkerPlugin) {
  return hoverTooltip(
    async (view, pos): Promise<Tooltip | null> => {
      if (!plugin.settings.hoverPreview) {
        return null;
      }
      const re = keyRegex(prefixList(plugin.settings));
      if (!re) {
        return null;
      }
      const line = view.state.doc.lineAt(pos);
      let found: { key: string; from: number; to: number } | null = null;
      for (const m of line.text.matchAll(re)) {
        const from = line.from + (m.index ?? 0);
        const to = from + m[0].length;
        if (pos >= from && pos <= to) {
          found = { key: m[0], from, to };
          break;
        }
      }
      if (!found) {
        return null;
      }
      const { key, from, to } = found;
      const result = await plugin.jira.getIssue(key);
      return {
        pos: from,
        end: to,
        above: true,
        create: () => ({ dom: renderCard(result, key) }),
      };
    },
    { hoverTime: 350 }
  );
}

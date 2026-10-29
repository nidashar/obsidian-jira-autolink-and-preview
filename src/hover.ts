import { hoverTooltip, Tooltip } from "@codemirror/view";
import type JiraLinkerPlugin from "./main";
import type { IssueResult } from "./jira";
import { keyRegex } from "./autolink";
import { prefixList } from "./settings";

function isInFencedCode(
  doc: { line(number: number): { text: string } },
  lineNumber: number
): boolean {
  let fence: "```" | "~~~" | null = null;
  for (let i = 1; i <= lineNumber; i++) {
    const match = /^\s*(```|~~~)/.exec(doc.line(i).text);
    if (!match) {
      continue;
    }
    if (!fence) {
      fence = match[1] as "```" | "~~~";
    } else if (match[1] === fence) {
      fence = null;
    }
  }
  return fence !== null;
}

function isExcludedInlineContext(line: string, start: number): boolean {
  const before = line.slice(0, start);
  let openCodeTicks: number | null = null;
  for (const match of before.matchAll(/(?<!\\)(`+)/g)) {
    const tickCount = match[1].length;
    if (openCodeTicks === null) {
      openCodeTicks = tickCount;
    } else if (openCodeTicks === tickCount) {
      openCodeTicks = null;
    }
  }
  if (openCodeTicks !== null) {
    return true;
  }
  const linkDestinationStart = before.lastIndexOf("](");
  if (linkDestinationStart >= 0 && before.lastIndexOf(")") < linkDestinationStart) {
    return true;
  }
  return /\b(?:https?:\/\/|www\.)\S*$/i.test(before);
}

export function renderCard(result: IssueResult, key: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "jira-linker-card";
  if (!result.ok) {
    const head = el.createDiv({ cls: "jira-linker-card-head", text: key });
    head.setAttr("aria-label", key);
    el.createDiv({ cls: "jira-linker-card-error", text: result.message });
    return el;
  }
  const i = result.issue;
  const head = el.createDiv({ cls: "jira-linker-card-head" });
  head.createSpan({ cls: "jira-linker-card-key", text: i.key });
  if (i.status) {
    head.createSpan({ cls: "jira-linker-card-status", text: i.status });
  }
  el.createDiv({ cls: "jira-linker-card-summary", text: i.summary });
  el.createDiv({
    cls: "jira-linker-card-meta",
    text: [i.type, i.assignee].filter(Boolean).join(" | "),
  });
  if (i.description) {
    el.createDiv({ cls: "jira-linker-card-desc", text: i.description });
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
export function editorHover(plugin: JiraLinkerPlugin) {
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
      if (
        isInFencedCode(view.state.doc, line.number) ||
        isExcludedInlineContext(line.text, from - line.from)
      ) {
        return null;
      }
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

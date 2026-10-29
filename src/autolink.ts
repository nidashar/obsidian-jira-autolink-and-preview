import { Editor } from "obsidian";
import type JiraLinkerPlugin from "./main";
import { prefixList } from "./settings";

const DELIMITER = /[\s.,;:!?)\]]/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function keyRegex(prefixes: string[]): RegExp | null {
  if (prefixes.length === 0) {
    return null;
  }
  return new RegExp(
    `(?<![A-Z0-9_])(?:${prefixes.map(escapeRe).join("|")})-\\d+(?![A-Z0-9_])`,
    "gi"
  );
}

function inCodeOrFrontmatter(editor: Editor, lineNo: number): boolean {
  if (editor.getLine(0).trim() === "---" && lineNo > 0) {
    let closed = false;
    for (let i = 1; i < lineNo; i++) {
      if (editor.getLine(i).trim() === "---") {
        closed = true;
        break;
      }
    }
    if (!closed) {
      return true;
    }
  }
  let fences = 0;
  for (let i = 0; i < lineNo; i++) {
    if (/^\s*(```|~~~)/.test(editor.getLine(i))) {
      fences++;
    }
  }
  return fences % 2 === 1;
}

export class AutoLinker {
  private busy = false;

  constructor(private plugin: JiraLinkerPlugin) {}

  handle(editor: Editor): void {
    const s = this.plugin.settings;
    if (this.busy || !s.autoLink || !s.baseUrl) {
      return;
    }
    const prefixes = prefixList(s);
    if (prefixes.length === 0) {
      return;
    }
    const cursor = editor.getCursor();
    const afterEnter = cursor.ch === 0 && cursor.line > 0;
    const lineNo = afterEnter ? cursor.line - 1 : cursor.line;
    const line = editor.getLine(lineNo);
    if (!afterEnter && (cursor.ch < 1 || !DELIMITER.test(line[cursor.ch - 1]))) {
      return;
    }
    const before = afterEnter ? line : line.slice(0, cursor.ch - 1);
    // Key at end of text; not preceded by a word char, "[", "(", "/", "|" or "-".
    const endRe = new RegExp(
      `(?:^|[^\\w\\[(/|-])((?:${prefixes.map(escapeRe).join("|")})-\\d+)$`,
      "i"
    );
    const match = endRe.exec(before);
    if (!match) {
      return;
    }
    const typedKey = match[1];
    const key = typedKey.toUpperCase();
    const start = before.length - typedKey.length;
    const prefix = before.slice(0, start);

    if ((prefix.match(/`/g) || []).length % 2 === 1) {
      return;
    }
    if ((prefix.match(/\[/g) || []).length > (prefix.match(/\]/g) || []).length) {
      return;
    }
    if (inCodeOrFrontmatter(editor, lineNo)) {
      return;
    }

    const link = `[${key}](${s.baseUrl}/browse/${key})`;
    this.busy = true;
    try {
      editor.replaceRange(
        link,
        { line: lineNo, ch: start },
        { line: lineNo, ch: start + typedKey.length }
      );
      editor.setCursor(
        afterEnter
          ? cursor
          : { line: cursor.line, ch: cursor.ch + (link.length - typedKey.length) }
      );
    } finally {
      this.busy = false;
    }
  }
}

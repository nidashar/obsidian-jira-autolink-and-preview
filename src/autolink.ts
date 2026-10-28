import { Editor } from "obsidian";
import type IfxLinkerPlugin from "./main";
import { prefixList } from "./settings";

const DELIMITER = /[\s.,;:!?)\]]/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function keyRegex(prefixes: string[]): RegExp | null {
  if (prefixes.length === 0) {
    return null;
  }
  return new RegExp(`(?:${prefixes.map(escapeRe).join("|")})-\\d+`, "g");
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

  constructor(private plugin: IfxLinkerPlugin) {}

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
    const line = editor.getLine(cursor.line);
    if (cursor.ch < 1 || !DELIMITER.test(line[cursor.ch - 1])) {
      return;
    }
    const before = line.slice(0, cursor.ch - 1);
    // Key at end of text; not preceded by a word char, "[", "(", "/", "|" or "-".
    const endRe = new RegExp(
      `(?:^|[^\\w\\[(/|-])((?:${prefixes.map(escapeRe).join("|")})-\\d+)$`
    );
    const match = endRe.exec(before);
    if (!match) {
      return;
    }
    const key = match[1];
    const start = before.length - key.length;
    const prefix = before.slice(0, start);

    if ((prefix.match(/`/g) || []).length % 2 === 1) {
      return;
    }
    if ((prefix.match(/\[/g) || []).length > (prefix.match(/\]/g) || []).length) {
      return;
    }
    if (inCodeOrFrontmatter(editor, cursor.line)) {
      return;
    }

    const link = `[${key}](${s.baseUrl}/browse/${key})`;
    this.busy = true;
    try {
      editor.replaceRange(
        link,
        { line: cursor.line, ch: start },
        { line: cursor.line, ch: start + key.length }
      );
      editor.setCursor({ line: cursor.line, ch: cursor.ch + (link.length - key.length) });
    } finally {
      this.busy = false;
    }
  }
}

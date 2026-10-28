import { Plugin } from "obsidian";
import { AutoLinker, keyRegex } from "./autolink";
import { editorHover, renderCard } from "./hover";
import { JiraClient } from "./jira";
import { DEFAULT_SETTINGS, IfxSettingTab, IfxSettings, prefixList } from "./settings";

export default class IfxLinkerPlugin extends Plugin {
  settings: IfxSettings = { ...DEFAULT_SETTINGS };
  jira!: JiraClient;
  private autoLinker!: AutoLinker;
  private popup: HTMLElement | null = null;
  private popupTimer: number | null = null;

  async onload() {
    await this.loadSettings();
    this.jira = new JiraClient(this);
    this.autoLinker = new AutoLinker(this);

    this.addSettingTab(new IfxSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on("editor-change", (editor) => this.autoLinker.handle(editor)));
    this.registerEditorExtension(editorHover(this));
    this.registerDomEvent(document, "mouseover", (e) => this.onReadingHover(e));
    this.registerDomEvent(document, "mouseout", (e) => this.onReadingOut(e));
  }

  onunload() {
    this.hidePopup();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private keyFromAnchor(a: HTMLAnchorElement): string | null {
    const re = keyRegex(prefixList(this.settings));
    if (!re) {
      return null;
    }
    const href = a.getAttribute("href") || "";
    if (!href.startsWith(this.settings.baseUrl + "/browse/")) {
      return null;
    }
    const m = href.match(re);
    return m ? m[0] : null;
  }

  private onReadingHover(e: MouseEvent) {
    if (!this.settings.hoverPreview) {
      return;
    }
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.("a.external-link") as HTMLAnchorElement | null;
    // Editor links are handled by the CodeMirror tooltip.
    if (!a || a.closest(".cm-editor")) {
      return;
    }
    const key = this.keyFromAnchor(a);
    if (!key) {
      return;
    }
    this.clearTimer();
    this.popupTimer = window.setTimeout(async () => {
      const result = await this.jira.getIssue(key);
      this.hidePopup();
      const card = renderCard(result, key);
      card.addClass("ifx-popup");
      document.body.appendChild(card);
      const r = a.getBoundingClientRect();
      card.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - card.offsetWidth - 8))}px`;
      card.style.top = `${r.bottom + 6}px`;
      this.popup = card;
    }, 350);
  }

  private onReadingOut(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("a.external-link")) {
      this.clearTimer();
      this.hidePopup();
    }
  }

  private clearTimer() {
    if (this.popupTimer !== null) {
      window.clearTimeout(this.popupTimer);
      this.popupTimer = null;
    }
  }

  private hidePopup() {
    this.popup?.remove();
    this.popup = null;
  }
}

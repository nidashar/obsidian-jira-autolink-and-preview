import { Plugin, setTooltip } from "obsidian";
import { AutoLinker, keyRegex } from "./autolink";
import { cardText, editorHover } from "./hover";
import { JiraClient } from "./jira";
import { DEFAULT_SETTINGS, IfxSettingTab, IfxSettings, prefixList } from "./settings";

export default class IfxLinkerPlugin extends Plugin {
  settings: IfxSettings = { ...DEFAULT_SETTINGS };
  jira!: JiraClient;
  private autoLinker!: AutoLinker;

  async onload() {
    await this.loadSettings();
    this.jira = new JiraClient(this);
    this.autoLinker = new AutoLinker(this);

    this.addSettingTab(new IfxSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on("editor-change", (editor) => this.autoLinker.handle(editor)));
    this.registerEditorExtension(editorHover(this));
    this.registerDomEvent(document, "mouseover", (e) => this.onReadingHover(e));
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
    if (!a || a.closest(".cm-editor") || a.dataset.ifxTip === "1") {
      return;
    }
    const key = this.keyFromAnchor(a);
    if (!key) {
      return;
    }
    a.dataset.ifxTip = "1";
    setTooltip(a, `${key}\nLoading...`, { placement: "top", delay: 300 });
    void this.jira.getIssue(key).then((result) => {
      setTooltip(a, cardText(result, key), { placement: "top", delay: 300 });
      // Re-fire hover so the native tooltip shows the fetched text if still hovered.
      if (a.matches(":hover")) {
        a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      }
    });
  }
}

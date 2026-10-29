import { Plugin, setTooltip } from "obsidian";
import { AutoLinker } from "./autolink";
import { cardText, editorHover } from "./hover";
import { JiraClient } from "./jira";
import {
  DEFAULT_SETTINGS,
  JiraLinkerSettingTab,
  JiraLinkerSettings,
  migrateTokenToSecretStorage,
  prefixList,
} from "./settings";

export default class JiraLinkerPlugin extends Plugin {
  settings: JiraLinkerSettings = { ...DEFAULT_SETTINGS };
  jira!: JiraClient;
  private autoLinker!: AutoLinker;

  async onload() {
    await this.loadSettings();
    await migrateTokenToSecretStorage(this);
    this.jira = new JiraClient(this);
    this.autoLinker = new AutoLinker(this);

    this.addSettingTab(new JiraLinkerSettingTab(this.app, this));
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
    const prefixes = prefixList(this.settings);
    if (prefixes.length === 0) {
      return null;
    }
    const href = a.getAttribute("href") || "";
    if (!href.startsWith(this.settings.baseUrl + "/browse/")) {
      return null;
    }
    let issuePath: string;
    try {
      issuePath = decodeURIComponent(href.slice((this.settings.baseUrl + "/browse/").length));
    } catch {
      return null;
    }
    const match = /^([A-Z][A-Z0-9_]*-\d+)$/.exec(issuePath);
    return match && prefixes.includes(match[1].split("-")[0]) ? match[1] : null;
  }

  private onReadingHover(e: MouseEvent) {
    if (!this.settings.hoverPreview) {
      return;
    }
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.("a.external-link") as HTMLAnchorElement | null;
    // Editor links are handled by the CodeMirror tooltip.
    if (!a || a.closest(".cm-editor") || a.dataset.jiraLinkerTip === "1") {
      return;
    }
    const key = this.keyFromAnchor(a);
    if (!key) {
      return;
    }
    a.dataset.jiraLinkerTip = "1";
    setTooltip(a, `${key}\nLoading...`, { placement: "top", delay: 300 });
    void this.jira.getIssue(key).then((result) => {
      setTooltip(a, cardText(result, key), { placement: "top", delay: 300 });
      // Re-fire hover so the native tooltip shows the fetched text if still hovered.
      if (a.matches(":hover")) {
        a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      }
    }).finally(() => {
      delete a.dataset.jiraLinkerTip;
    });
  }
}

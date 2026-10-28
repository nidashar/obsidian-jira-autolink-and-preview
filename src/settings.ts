import { App, PluginSettingTab, Setting } from "obsidian";
import type IfxLinkerPlugin from "./main";

export interface IfxSettings {
  baseUrl: string;
  prefixes: string;
  autoLink: boolean;
  hoverPreview: boolean;
  email: string;
  cacheMinutes: number;
  // Only used when Obsidian secret storage is unavailable.
  fallbackToken: string;
}

export const DEFAULT_SETTINGS: IfxSettings = {
  baseUrl: "https://collinsongroup.atlassian.net",
  prefixes: "IFX",
  autoLink: true,
  hoverPreview: true,
  email: "",
  cacheMinutes: 10,
  fallbackToken: "",
};

const SECRET_ID = "ifx-linker-jira-token";

interface SecretStorageLike {
  getSecret(id: string): string | null | undefined;
  setSecret(id: string, value: string): void;
}

function secretStorage(app: App): SecretStorageLike | null {
  const s = (app as unknown as { secretStorage?: SecretStorageLike }).secretStorage;
  if (s && typeof s.getSecret === "function" && typeof s.setSecret === "function") {
    return s;
  }
  return null;
}

export function getToken(plugin: IfxLinkerPlugin): string {
  const store = secretStorage(plugin.app);
  if (store) {
    return store.getSecret(SECRET_ID) || "";
  }
  return plugin.settings.fallbackToken;
}

export async function setToken(plugin: IfxLinkerPlugin, token: string): Promise<void> {
  const store = secretStorage(plugin.app);
  if (store) {
    store.setSecret(SECRET_ID, token);
    return;
  }
  plugin.settings.fallbackToken = token;
  await plugin.saveSettings();
}

export function prefixList(settings: IfxSettings): string[] {
  return settings.prefixes
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p) => /^[A-Z][A-Z0-9_]*$/.test(p));
}

export class IfxSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: IfxLinkerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("Jira base URL")
      .setDesc("For example https://your-site.atlassian.net")
      .addText((t) =>
        t.setValue(s.baseUrl).onChange(async (v) => {
          s.baseUrl = v.trim().replace(/\/+$/, "");
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Project prefixes")
      .setDesc("Comma separated, for example IFX, ABC")
      .addText((t) =>
        t.setValue(s.prefixes).onChange(async (v) => {
          s.prefixes = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Auto-link while typing")
      .setDesc("Convert a typed key to a link after a space or punctuation.")
      .addToggle((t) =>
        t.setValue(s.autoLink).onChange(async (v) => {
          s.autoLink = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Hover preview")
      .setDesc("Show summary and status when hovering a Jira link. Needs email and API token.")
      .addToggle((t) =>
        t.setValue(s.hoverPreview).onChange(async (v) => {
          s.hoverPreview = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Atlassian email")
      .addText((t) =>
        t.setValue(s.email).onChange(async (v) => {
          s.email = v.trim();
          await this.plugin.saveSettings();
        })
      );

    const hasStore = secretStorage(this.app) !== null;
    new Setting(containerEl)
      .setName("Atlassian API token")
      .setDesc(
        hasStore
          ? "Stored in Obsidian secret storage. Create one at id.atlassian.com/manage-profile/security/api-tokens"
          : "Secret storage is unavailable in this Obsidian version, so the token is saved in plaintext in this plugin's data.json. Do not share or commit that file."
      )
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(getToken(this.plugin)).onChange(async (v) => {
          await setToken(this.plugin, v.trim());
          this.plugin.jira.clearCache();
        });
      });

    new Setting(containerEl)
      .setName("Cache duration (minutes)")
      .addText((t) =>
        t.setValue(String(s.cacheMinutes)).onChange(async (v) => {
          const n = Number(v);
          s.cacheMinutes = Number.isFinite(n) && n >= 0 ? n : 10;
          await this.plugin.saveSettings();
        })
      );
  }
}

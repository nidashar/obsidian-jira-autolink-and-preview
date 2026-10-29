import { App, PluginSettingTab, Setting } from "obsidian";
import type JiraLinkerPlugin from "./main";

export interface JiraLinkerSettings {
  baseUrl: string;
  prefixes: string;
  autoLink: boolean;
  hoverPreview: boolean;
  email: string;
  cacheMinutes: number;
  // Only used when Obsidian secret storage is unavailable.
  fallbackToken: string;
}

export const DEFAULT_SETTINGS: JiraLinkerSettings = {
  baseUrl: "",
  prefixes: "",
  autoLink: true,
  hoverPreview: true,
  email: "",
  cacheMinutes: 10,
  fallbackToken: "",
};

const SECRET_ID = "jira-linker-api-token";
const API_TOKEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";

type ValidationResult =
  | { valid: true; normalized: string; message: string }
  | { valid: false; message: string };

export function validateJiraBaseUrl(value: string): ValidationResult {
  const input = value.trim();
  if (!input) {
    return { valid: false, message: "Required. Enter your Jira site URL." };
  }
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
    return { valid: false, message: "Include https:// at the beginning of the URL." };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, message: "Enter a valid Jira URL." };
  }
  if (url.protocol !== "https:") {
    return { valid: false, message: "Use HTTPS to protect your Jira credentials." };
  }
  if (url.username || url.password) {
    return { valid: false, message: "Do not include credentials in the Jira URL." };
  }
  if (url.search || url.hash) {
    return { valid: false, message: "Enter the Jira site URL without a query or fragment." };
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return { valid: false, message: "Enter the Jira site URL, not an issue or project URL." };
  }
  return { valid: true, normalized: url.origin, message: "Valid Jira URL." };
}

function validatePrefixes(value: string): ValidationResult {
  const entries = value.split(",").map((prefix) => prefix.trim()).filter(Boolean);
  if (entries.length === 0) {
    return { valid: false, message: "Required. Enter at least one Jira project prefix." };
  }
  const invalid = entries.filter((prefix) => !/^[A-Z][A-Z0-9_]*$/i.test(prefix));
  if (invalid.length > 0) {
    return {
      valid: false,
      message: `Invalid project ${invalid.length === 1 ? "prefix" : "prefixes"}: ${invalid.join(", ")}`,
    };
  }
  return {
    valid: true,
    normalized: entries.join(", "),
    message: `${entries.length} project ${entries.length === 1 ? "prefix" : "prefixes"} configured.`,
  };
}

function setValidationState(
  setting: Setting,
  input: HTMLInputElement,
  result: ValidationResult
): void {
  setting.setDesc(result.message);
  input.classList.toggle("jira-linker-invalid-input", !result.valid);
  input.setAttribute("aria-invalid", String(!result.valid));
}

function tokenDescription(hasStore: boolean): DocumentFragment {
  const description = document.createDocumentFragment();
  description.append(
    hasStore
      ? "Stored in Obsidian secret storage. "
      : "Secret storage is unavailable, so the token is saved in plaintext in this plugin's data.json. Do not share or commit that file. "
  );
  const link = document.createElement("a");
  link.href = API_TOKEN_URL;
  link.textContent = "Create an Atlassian API token";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  description.append(link, ".");
  return description;
}

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

export function getToken(plugin: JiraLinkerPlugin): string {
  const store = secretStorage(plugin.app);
  if (store) {
    return store.getSecret(SECRET_ID) || plugin.settings.fallbackToken;
  }
  return plugin.settings.fallbackToken;
}

export async function setToken(plugin: JiraLinkerPlugin, token: string): Promise<void> {
  const store = secretStorage(plugin.app);
  if (store) {
    store.setSecret(SECRET_ID, token);
    if (plugin.settings.fallbackToken) {
      plugin.settings.fallbackToken = "";
      await plugin.saveSettings();
    }
    return;
  }
  plugin.settings.fallbackToken = token;
  await plugin.saveSettings();
}

export async function migrateTokenToSecretStorage(plugin: JiraLinkerPlugin): Promise<void> {
  const store = secretStorage(plugin.app);
  const fallbackToken = plugin.settings.fallbackToken;
  if (!store || !fallbackToken) {
    return;
  }
  if (!store.getSecret(SECRET_ID)) {
    store.setSecret(SECRET_ID, fallbackToken);
  }
  plugin.settings.fallbackToken = "";
  await plugin.saveSettings();
}

export function prefixList(settings: JiraLinkerSettings): string[] {
  return settings.prefixes
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p) => /^[A-Z][A-Z0-9_]*$/.test(p));
}

export class JiraLinkerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: JiraLinkerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    containerEl.createEl("h2", { text: "Jira Linker setup" });
    containerEl.createEl("p", {
      text: "Add your Jira URL and project prefixes to create links. Add your Atlassian email and API token to show issue details on hover.",
    });

    let jiraUrlDraft = s.baseUrl;
    const jiraUrlSetting = new Setting(containerEl)
      .setName("Jira base URL")
      .setDesc("Required. For example https://your-site.atlassian.net");
    jiraUrlSetting.addText((t) => {
      t.setPlaceholder("https://your-site.atlassian.net");
      t.setValue(s.baseUrl);
      setValidationState(jiraUrlSetting, t.inputEl, validateJiraBaseUrl(s.baseUrl));
      t.onChange(async (value) => {
        jiraUrlDraft = value;
        const result = validateJiraBaseUrl(value);
        setValidationState(jiraUrlSetting, t.inputEl, result);
        if (!value.trim()) {
          s.baseUrl = "";
        } else if (!result.valid) {
          return;
        } else {
          s.baseUrl = result.normalized;
        }
        this.plugin.jira.clearCache();
        await this.plugin.saveSettings();
      });
    });

    const prefixSetting = new Setting(containerEl)
      .setName("Project prefixes")
      .setDesc("Required. Comma separated and case insensitive, for example ABC, XYZ");
    prefixSetting.addText((t) => {
      t.setPlaceholder("ABC, XYZ");
      t.setValue(s.prefixes);
      setValidationState(prefixSetting, t.inputEl, validatePrefixes(s.prefixes));
      t.onChange(async (value) => {
        const result = validatePrefixes(value);
        setValidationState(prefixSetting, t.inputEl, result);
        if (!value.trim()) {
          s.prefixes = "";
        } else if (!result.valid) {
          return;
        } else {
          s.prefixes = result.normalized;
        }
        await this.plugin.saveSettings();
      });
    });

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
      .addText((t) => {
        t.setPlaceholder("you@example.com");
        t.setValue(s.email).onChange(async (v) => {
          s.email = v.trim();
          this.plugin.jira.clearCache();
          await this.plugin.saveSettings();
        });
      });

    const hasStore = secretStorage(this.app) !== null;
    new Setting(containerEl)
      .setName("Atlassian API token")
      .setDesc(tokenDescription(hasStore))
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(getToken(this.plugin)).onChange(async (v) => {
          await setToken(this.plugin, v.trim());
          this.plugin.jira.clearCache();
        });
      });

    const connectionSetting = new Setting(containerEl)
      .setName("Jira connection")
      .setDesc("Check the Jira URL, email and API token.");
    connectionSetting.addButton((button) =>
      button.setButtonText("Test connection").setCta().onClick(async () => {
        const urlResult = validateJiraBaseUrl(jiraUrlDraft);
        if (!urlResult.valid) {
          connectionSetting.setDesc("Correct the Jira URL before testing the connection.");
          return;
        }
        button.setDisabled(true).setButtonText("Testing…");
        connectionSetting.setDesc("Connecting to Jira…");
        try {
          const result = await this.plugin.jira.testConnection();
          connectionSetting.setDesc(
            result.ok
              ? `Connected successfully${result.displayName ? ` as ${result.displayName}` : ""}.`
              : result.message
          );
        } finally {
          button.setDisabled(false).setButtonText("Test connection");
        }
      })
    );

    new Setting(containerEl)
      .setName("Cache duration (minutes)")
      .addText((t) =>
        t.setValue(String(s.cacheMinutes)).onChange(async (v) => {
          const n = Number(v);
          s.cacheMinutes = Number.isFinite(n) && n >= 0 ? n : 10;
          this.plugin.jira.clearCache();
          await this.plugin.saveSettings();
        })
      );
  }
}

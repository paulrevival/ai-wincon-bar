import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import checkbox from "@inquirer/checkbox";
import confirm from "@inquirer/confirm";
import inputNum from "@inquirer/number";
import type { WinconBarConfig } from "./types.js";
import { saveConfig, updateSettingsStatusLine, loadConfig, clearCache } from "./config.js";
import { applyCodexConfig, getCodexSkillPath, getCodexVersion, MIN_CODEX_VERSION, versionAtLeast } from "./codex.js";

/** Путь назначения SKILL.md. Env-overridable (AI_WINCON_BAR_SKILLS_DIR) для тестов. */
export function getSkillDestPath(platform: "claude" | "codex" = "claude"): string {
  if (platform === "codex") return getCodexSkillPath();
  const dir = process.env.AI_WINCON_BAR_SKILLS_DIR
    ?? join(homedir(), ".claude", "skills", "ai-wincon-bar");
  return join(dir, "SKILL.md");
}

/**
 * Перезаписать dest содержимым src, если оно различается.
 * true — файл обновлён; false — dest не существует или уже актуален.
 */
export function updateSkillFile(destPath: string, srcContent: string): boolean {
  if (!existsSync(destPath)) return false;
  if (readFileSync(destPath, "utf-8") === srcContent) return false;
  writeFileSync(destPath, srcContent, "utf-8");
  return true;
}

/** Default statusLine refreshInterval (seconds) — once a minute, matching hh:mm. */
const REFRESH_INTERVAL_SEC = 60;

const ELEMENT_CHOICES = [
  { name: "Session name (/my-project) — Claude Code, Codex", value: "sessionName" },
  { name: "Model name ([Sonnet 4.6]) — Claude Code, Codex", value: "modelName" },
  { name: "Progress bar (▓▓▓░░░) — Claude Code only", value: "progressBar" },
  { name: "Context percentage (45%) — Claude Code, Codex", value: "percent" },
  { name: "Token counters — Claude Code, Codex", value: "tokens" },
  { name: "5-hour rate limit — Claude Code, Codex", value: "tariff" },
  { name: "Weekly limit — Claude Code, Codex", value: "tariffWeekly" },
  { name: "Session time (⧗ 00h:42m) — Claude Code only", value: "sessionTime" },
  { name: "Reasoning effort — Codex only", value: "reasoningEffort" },
  { name: "Git branch — Codex only", value: "gitBranch" },
  { name: "Fast mode — Codex only", value: "fastMode" },
  { name: "Permission profile — Codex only", value: "permissionProfile" },
  { name: "Cumulative session tokens — Codex only", value: "cumulativeTokens" },
  { name: "Theme colors — Codex only", value: "codexThemeColors" },
] as const;

/** Путь к bundled SKILL.md либо null, если запущены из исходников (файла рядом нет). */
function resolveBundledSkillPath(): string | null {
  const url = fileURLToPath(import.meta.url);
  // Dev mode (запуск из исходников .ts) — bundled артефакта рядом нет.
  if (url.endsWith(".ts")) return null;
  const thisDir = dirname(url);
  const skillSource = join(thisDir, "..", "SKILL.md");
  return existsSync(skillSource) ? skillSource : null;
}

/**
 * Install the SKILL.md file to ~/.claude/skills/ai-wincon-bar/ so that
 * the /ai-wincon-bar skill is available inside Claude Code.
 * No-op, если уже установлен или запущены из исходников.
 */
export function installSkill(platform: "claude" | "codex" = "claude"): void {
  const skillDest = getSkillDestPath(platform);
  if (existsSync(skillDest)) return;
  const skillSource = resolveBundledSkillPath();
  if (!skillSource) return;
  mkdirSync(dirname(skillDest), { recursive: true });
  writeFileSync(skillDest, readFileSync(skillSource, "utf-8"), "utf-8");
  console.log(`✅ Skill installed for ${platform === "claude" ? "Claude Code" : "Codex"}`);
}

/**
 * Тихо обновить уже установленный SKILL.md до bundled-версии, если содержимое разошлось.
 * No-op, если файл не установлен (установка — через setup), уже актуален, или запущены из исходников.
 */
export function upgradeSkill(): void {
  const skillSource = resolveBundledSkillPath();
  if (!skillSource) return;
  for (const platform of ["claude", "codex"] as const) {
    const skillDest = getSkillDestPath(platform);
    if (existsSync(skillDest) && updateSkillFile(skillDest, readFileSync(skillSource, "utf-8"))) {
      console.log(`✅ SKILL.md updated for ${platform === "claude" ? "Claude Code" : "Codex"}`);
    }
  }
}

export async function runSetup(
  existingConfig?: WinconBarConfig,
): Promise<void> {
  const config = existingConfig ?? loadConfig();

  console.log("\n🪟 ai-wincon-bar config\n");

  const codexVersion = getCodexVersion();
  const claudeDetected = existsSync(process.env.AI_WINCON_BAR_SETTINGS_PATH ?? join(homedir(), ".claude", "settings.json"))
    || existsSync(join(homedir(), ".claude"));
  const selectedPlatforms = await checkbox({
    message: "Configure platforms:",
    choices: [
      { name: `Claude Code${claudeDetected ? " — detected" : ""}`, value: "claude", checked: existingConfig ? config.platforms.claude : claudeDetected },
      { name: `Codex${codexVersion ? ` — detected (${codexVersion})` : ""}`, value: "codex", checked: existingConfig ? config.platforms.codex : Boolean(codexVersion) },
    ],
    required: true,
  });
  const configureClaude = selectedPlatforms.includes("claude");
  const configureCodex = selectedPlatforms.includes("codex");

  // 1. Select elements
  const selectedElements = await checkbox({
    message: "Select which elements to display:",
    choices: ELEMENT_CHOICES.map((c) => ({
      name: c.name,
      value: c.value,
      checked: config.elements[c.value as keyof typeof config.elements],
    })),
  });

  // 2. Thresholds — loop until valid
  let yellow: number | undefined;
  let red: number | undefined;

  while (true) {
    yellow = await inputNum({
      message: "Yellow threshold (percentage):",
      default: config.thresholds.yellow,
      min: 0,
      max: 100,
    });

    red = await inputNum({
      message: "Red threshold (percentage):",
      default: config.thresholds.red,
      min: 0,
      max: 100,
    });

    if (yellow == null || red == null) {
      console.error("\n❌ Setup cancelled.");
      return;
    }

    if (yellow >= red) {
      console.error(
        "\n❌ Yellow threshold must be less than red threshold.\n",
      );
      continue;
    }

    break;
  }

  // 3. Session retention (days) — bounds how long sessions.json keeps records.
  const sessionRetentionDays = await inputNum({
    message: "Session retention (days) for the `sessions` report:",
    default: config.sessionRetentionDays,
    min: 1,
  });

  if (sessionRetentionDays == null) {
    console.error("\n❌ Setup cancelled.");
    return;
  }

  // 4. Build and save config
  const newConfig: WinconBarConfig = {
    platforms: { claude: configureClaude, codex: configureCodex },
    elements: {
      modelName: selectedElements.includes("modelName"),
      progressBar: selectedElements.includes("progressBar"),
      percent: selectedElements.includes("percent"),
      tokens: selectedElements.includes("tokens"),
      tariff: selectedElements.includes("tariff"),
      tariffWeekly: selectedElements.includes("tariffWeekly"),
      sessionName: selectedElements.includes("sessionName"),
      sessionTime: selectedElements.includes("sessionTime"),
      reasoningEffort: selectedElements.includes("reasoningEffort"),
      gitBranch: selectedElements.includes("gitBranch"),
      fastMode: selectedElements.includes("fastMode"),
      permissionProfile: selectedElements.includes("permissionProfile"),
      cumulativeTokens: selectedElements.includes("cumulativeTokens"),
      codexThemeColors: selectedElements.includes("codexThemeColors"),
    },
    thresholds: { yellow, red },
    sessionRetentionDays,
    codexBackup: config.codexBackup,
  };

  clearCache();

  if (configureCodex) {
    if (!codexVersion || !versionAtLeast(codexVersion)) {
      console.warn(`\n⚠️ Codex ${MIN_CODEX_VERSION}+ is required; Codex config was not changed.`);
    } else {
      newConfig.codexBackup = applyCodexConfig(newConfig);
      console.log("\n✅ Native Codex status line updated in ~/.codex/config.toml");
    }
  }

  saveConfig(newConfig);
  console.log("✅ Config saved to ~/.config/ai-wincon-bar/ai-wincon-bar.json");

  // 5. Update settings.json
  const shouldUpdateSettings = configureClaude && await confirm({
    message: "Update ~/.claude/settings.json to enable the status line?",
    default: true,
  });

  if (shouldUpdateSettings) {
    // Event-driven updates go quiet while the session is idle, so the session
    // clock freezes between turns. refreshInterval re-runs the command on a timer
    // (locally — no API/token cost) to keep it ticking. 60s matches the hh:mm
    // display granularity.
    const shouldRefresh = await confirm({
      message:
        "Refresh the bar on a timer (once a minute) so the session clock keeps ticking while idle?",
      default: true,
    });
    updateSettingsStatusLine(shouldRefresh ? REFRESH_INTERVAL_SEC : undefined);
    console.log("✅ statusLine updated in ~/.claude/settings.json");
  }

  // 6. Install skill
  const shouldInstallSkill = await confirm({
    message: "Install the ai-wincon-bar chat skill for selected platforms?",
    default: true,
  });

  if (shouldInstallSkill) {
    if (configureClaude) installSkill("claude");
    if (configureCodex) installSkill("codex");
  }

  const names = [configureClaude && "Claude Code", configureCodex && "Codex"].filter(Boolean).join(" and ");
  console.log(`\n🎉 Done! Restart ${names} to see the status line.\n`);
}

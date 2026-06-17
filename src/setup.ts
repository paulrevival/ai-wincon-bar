import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import checkbox from "@inquirer/checkbox";
import confirm from "@inquirer/confirm";
import inputNum from "@inquirer/number";
import type { WinconBarConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./constants.js";
import { saveConfig, updateSettingsStatusLine, loadConfig, clearCache } from "./config.js";

/** Путь назначения SKILL.md. Env-overridable (AI_WINCON_BAR_SKILLS_DIR) для тестов. */
export function getSkillDestPath(): string {
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

const ELEMENT_CHOICES = [
  { name: "Model name ([glm-5.1])", value: "modelName" },
  { name: "Progress bar (▓▓▓░░░)", value: "progressBar" },
  { name: "Percentage (45%)", value: "percent" },
  { name: "Tokens (95K/200K)", value: "tokens" },
  { name: "Tariff / Rate limits (5h: 12%)", value: "tariff" },
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
export function installSkill(): void {
  const skillDest = getSkillDestPath();
  if (existsSync(skillDest)) return;
  const skillSource = resolveBundledSkillPath();
  if (!skillSource) return;
  mkdirSync(dirname(skillDest), { recursive: true });
  writeFileSync(skillDest, readFileSync(skillSource, "utf-8"), "utf-8");
  console.log("✅ Skill installed to ~/.claude/skills/ai-wincon-bar/SKILL.md");
}

/**
 * Тихо обновить уже установленный SKILL.md до bundled-версии, если содержимое разошлось.
 * No-op, если файл не установлен (установка — через setup), уже актуален, или запущены из исходников.
 */
export function upgradeSkill(): void {
  const skillDest = getSkillDestPath();
  if (!existsSync(skillDest)) return;
  const skillSource = resolveBundledSkillPath();
  if (!skillSource) return;
  if (updateSkillFile(skillDest, readFileSync(skillSource, "utf-8"))) {
    console.log("✅ SKILL.md обновлён до актуальной версии");
  }
}

export async function runSetup(
  existingConfig?: WinconBarConfig,
): Promise<void> {
  const config = existingConfig ?? loadConfig();

  console.log("\n🪟 ai-wincon-bar config\n");

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

  // 3. Build and save config
  const newConfig: WinconBarConfig = {
    elements: {
      modelName: selectedElements.includes("modelName"),
      progressBar: selectedElements.includes("progressBar"),
      percent: selectedElements.includes("percent"),
      tokens: selectedElements.includes("tokens"),
      tariff: selectedElements.includes("tariff"),
    },
    thresholds: { yellow, red },
  };

  saveConfig(newConfig);
  clearCache();
  console.log(`\n✅ Config saved to ~/.claude/ai-wincon-bar/config.json`);

  // 4. Update settings.json
  const shouldUpdateSettings = await confirm({
    message: "Update ~/.claude/settings.json to enable the status line?",
    default: true,
  });

  if (shouldUpdateSettings) {
    updateSettingsStatusLine();
    console.log("✅ statusLine updated in ~/.claude/settings.json");
  }

  // 5. Install skill
  const shouldInstallSkill = await confirm({
    message: "Install /ai-wincon-bar skill? This lets you configure the bar from within Claude Code.",
    default: true,
  });

  if (shouldInstallSkill) {
    installSkill();
  }

  console.log("\n🎉 Done! Restart Claude Code to see the status bar.\n");
}

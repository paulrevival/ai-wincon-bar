import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import confirm from "@inquirer/confirm";
import { getConfigPath, getLegacyDataDir, getSettingsPath, loadConfig } from "./config.js";
import { getCodexSkillPath, restoreCodexConfig } from "./codex.js";

export async function runUninstall(): Promise<void> {
  console.log("\n🗑️  ai-wincon-bar uninstall\n");

  const shouldProceed = await confirm({
    message: "Remove all ai-wincon-bar files, skill, statusLine config, and uninstall the npm package?",
    default: false,
  });

  if (!shouldProceed) {
    console.log("\nCancelled. No changes made.\n");
    return;
  }

  const config = loadConfig();

  // 1. Restore the Codex status line only if it still matches our last write.
  if (config.codexBackup) {
    const result = restoreCodexConfig(config.codexBackup);
    if (result === "restored") console.log("✅ Restored previous Codex status line");
    if (result === "changed") console.log("⚠️ Codex status line changed since setup; left it untouched");
  }

  // 2. Remove neutral data directory.
  const dataDir = dirname(getConfigPath());
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
    console.log("✅ Removed ai-wincon-bar data directory");
  }
  const legacyDataDir = getLegacyDataDir();
  if (legacyDataDir !== dataDir && existsSync(legacyDataDir)) {
    rmSync(legacyDataDir, { recursive: true, force: true });
    console.log("✅ Removed retained legacy data directory");
  }

  // 3. Remove skills from both platforms.
  const skillPaths = [
    join(homedir(), ".claude", "skills", "ai-wincon-bar"),
    dirname(getCodexSkillPath()),
  ];
  for (const skillPath of skillPaths) {
    if (existsSync(skillPath)) rmSync(skillPath, { recursive: true, force: true });
  }

  // 3. Remove statusLine from settings.json
  const settingsPath = getSettingsPath();
  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const statusLine = settings.statusLine as Record<string, unknown> | undefined;
      if (statusLine?.command === "ai-wincon-bar") {
        delete settings.statusLine;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
        console.log("✅ Removed statusLine from ~/.claude/settings.json");
      }
    } catch {
      // Malformed settings — skip
    }
  }

  // 5. Uninstall npm package globally
  console.log("\n📦 Uninstalling npm package...");
  const result = spawnSync("npm", ["uninstall", "-g", "@paulrevival/ai-wincon-bar"], {
    stdio: "inherit",
  });

  if (result.status === 0) {
    console.log("\n👋 ai-wincon-bar has been fully uninstalled.\n");
  } else {
    console.log("\n⚠️  npm uninstall failed. You can remove it manually:");
    console.log("   npm uninstall -g @paulrevival/ai-wincon-bar\n");
  }
}

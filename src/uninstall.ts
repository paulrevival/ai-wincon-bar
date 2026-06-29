import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import confirm from "@inquirer/confirm";
import { getConfigPath, getSettingsPath } from "./config.js";

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

  // 1. Remove data directory (~/.claude/ai-wincon-bar/)
  const dataDir = dirname(getConfigPath());
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
    console.log("✅ Removed ~/.claude/ai-wincon-bar/");
  }

  // 2. Remove skill
  const skillPath = join(homedir(), ".claude", "skills", "ai-wincon-bar");
  if (existsSync(skillPath)) {
    rmSync(skillPath, { recursive: true, force: true });
    console.log("✅ Removed ~/.claude/skills/ai-wincon-bar/");
  }

  // 3. Remove statusLine from settings.json
  const settingsPath = getSettingsPath();
  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      if ("statusLine" in settings) {
        delete settings.statusLine;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
        console.log("✅ Removed statusLine from ~/.claude/settings.json");
      }
    } catch {
      // Malformed settings — skip
    }
  }

  // 4. Uninstall npm package globally
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

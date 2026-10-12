// Offline launcher — plain Node entry point (CommonJS).
//
// This is the file you double-click (via Start Offline.bat). It exists as
// .js so it runs under plain Node — no build step, no tsx, no editor.
// It simply hands off to the TypeScript launcher (scripts/offline.ts)
// using the project's bundled tsx runner.

const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

// This file lives in <package>/scripts/, so the package ROOT is one level up.
// Getting this wrong would make every path below resolve to
// <package>/scripts/node_modules/... and the launcher would abort immediately.
const ROOT = join(__dirname, "..");

function resolveNode() {
  // Prefer a Node runtime bundled inside the folder (set up by the installer).
  const bundled = join(ROOT, "runtime", "node", "node.exe");
  if (existsSync(bundled)) return bundled;
  return process.execPath; // fall back to whatever Node launched us
}

const nodeBin = resolveNode();
const tsxJs = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

if (!existsSync(tsxJs)) {
  console.error("");
  console.error("  Could not find the bundled runner (node_modules/tsx/dist/cli.mjs).");
  console.error("  This folder may be incomplete. Re-extract the full package,");
  console.error("  or see SETUP.md for troubleshooting.");
  console.error("");
  process.exit(1);
}

const tsLauncher = join(ROOT, "scripts", "offline.ts");
const child = spawn(nodeBin, [tsxJs, tsLauncher], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
  shell: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

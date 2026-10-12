// Offline launcher — "server mode".
//
// This is the single entry point you double-click (via Start Offline.bat).
// It:
//   1. Prompts for your Postgres connection string on first run (saved to .env).
//   2. Applies the database schema and seeds demo data (first run only).
//   3. Starts BOTH the Next.js server and the realtime service together.
//   4. Prints the addresses to open — including a LAN address other devices
//      on the same network can use.
//
// No code editor, no npm, no terminal knowledge required.

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { detectLanIp } from "./lan";

const ROOT = join(__dirname, "..");
const ENV_PATH = join(ROOT, ".env");
const FIRST_RUN_FLAG = join(ROOT, ".offline-initialized");

const APP_PORT = Number(process.env.APP_PORT ?? 3000);
const RT_PORT = Number(process.env.REALTIME_PORT ?? 4000);

const children: { name: string; proc: ChildProcess }[] = [];
let shuttingDown = false;

// Resolve a package's real JS entry so every child runs as
// `process.execPath <js-entry>`.
//
// We deliberately never exec the `node_modules/.bin/*.cmd` shims:
//   • Node >= 18 refuses to spawn .cmd without a shell (and we don't want a shell),
//   • those shims invoke bare `node`, which on a laptop running ONLY the bundled
//     runtime wouldn't exist — silently falling back to a wrong/absent Node.
const NM = join(ROOT, "node_modules");

function pkgEntry(name: string, candidates: string[]): string {
  for (const rel of candidates) {
    const full = join(NM, name, rel);
    if (existsSync(full)) return full;
  }
  throw new Error(
    `Could not locate entry point for "${name}". This folder is incomplete — re-extract the full package.`
  );
}

const prismaCli = () => pkgEntry("prisma", ["build/index.js", "build/index.cjs"]);
const nextCli = () => pkgEntry("next", ["dist/bin/next"]);
const tsxCli = () => pkgEntry("tsx", ["dist/cli.mjs"]);

// Prisma needs to know where its schema lives at runtime, and the packaged
// folder has a different layout than the dev repo.
function prismaSchemaPath(): string {
  const candidate = join(ROOT, "prisma", "schema.prisma");
  return existsSync(candidate) ? candidate : join(ROOT, "schema.prisma");
}

function log(msg = "") {
  console.log(msg);
}

function pause(): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.resume();
      process.stdin.once("data", () => resolve());
    } else {
      resolve();
    }
  });
}

function waitForPort(port: number, timeoutMs = 90_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = createServer();
      sock.once("error", () => {
        sock.close();
        // Port is in use → something is listening → we're up.
        resolve();
      });
      sock.once("listening", () => {
        sock.close(() => {
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`Timed out waiting for port ${port}`));
          } else {
            setTimeout(tryOnce, 500);
          }
        });
      });
      sock.listen(port, "0.0.0.0");
    };
    tryOnce();
  });
}

function startProcess(name: string, cmd: string, args: string[]): ChildProcess {
  const proc = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    shell: false,
  });
  const prefix = `[${name}] `;
  const pipe = (stream: NodeJS.ReadableStream | null) => {
    if (!stream) return;
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) log(prefix + line);
    });
  };
  pipe(proc.stdout);
  pipe(proc.stderr);
  proc.on("exit", (code) => {
    if (!shuttingDown) {
      log(`${prefix}exited with code ${code}`);
      shutdown(1);
    }
  });
  children.push({ name, proc });
  return proc;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("\nShutting down…");
  for (const { proc } of children) {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500);
}

// Runs a one-shot command as `node <js-entry> …` with inherited stdio.
function runOnce(name: string, argv: string[]): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, argv, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env },
      shell: false,
    });
    proc.on("error", () => resolve(1));
    proc.on("exit", (code) => resolve(code ?? 1));
  });
}

function getEnvValue(source: string, key: string): string | null {
  const match = source.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

async function ensureEnv(): Promise<void> {
  if (existsSync(ENV_PATH)) {
    log("• Found existing configuration (.env).");
    return;
  }
  log("");
  log("───────────────────────────────────────────────");
  log("  First run — one-time setup");
  log("───────────────────────────────────────────────");
  log("");
  log("Enter your Postgres connection string.");
  log("(e.g. a Neon/cloud URL, or a local Postgres URL.)");
  log("");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let databaseUrl = "";
  while (!databaseUrl.trim()) {
    databaseUrl = (await rl.question("DATABASE_URL = ")).trim();
    if (!databaseUrl.trim()) log("  A connection string is required. Please paste one.");
  }
  let sessionSecret = "";
  while (!sessionSecret.trim()) {
    sessionSecret = (await rl.question("SESSION_SECRET (any long random text) = ")).trim();
    if (!sessionSecret.trim()) log("  Please enter any long random text.");
  }
  rl.close();

  const contents = [
    `DATABASE_URL="${databaseUrl}"`,
    `SESSION_SECRET="${sessionSecret}"`,
    `SESSION_TTL_HOURS="24"`,
    `REALTIME_PORT="${RT_PORT}"`,
    `REALTIME_INTERNAL_SECRET="${sessionSecret}-realtime"`,
    "",
  ].join("\n");
  writeFileSync(ENV_PATH, contents, "utf8");
  log("• Saved configuration to .env");
}

function loadEnvIntoProcess(): void {
  if (!existsSync(ENV_PATH)) return;
  const raw = readFileSync(ENV_PATH, "utf8");
  for (const key of [
    "DATABASE_URL",
    "SESSION_SECRET",
    "SESSION_TTL_HOURS",
    "REALTIME_PORT",
    "REALTIME_INTERNAL_SECRET",
  ]) {
    const value = getEnvValue(raw, key);
    if (value) process.env[key] = value;
  }
}

async function setupDatabase(): Promise<void> {
  if (existsSync(FIRST_RUN_FLAG)) {
    log("• Database already initialized — skipping setup.");
    return;
  }
  log("");
  log("Applying database schema and seed (first run)…");
  const genCode = await runOnce("setup", [prismaCli(), "generate", "--schema", prismaSchemaPath()]);
  if (genCode !== 0) throw new Error("prisma generate failed");
  const pushCode = await runOnce("setup", [prismaCli(), "db", "push", "--schema", prismaSchemaPath()]);
  if (pushCode !== 0) throw new Error("prisma db push failed — check your DATABASE_URL.");
  const seedCode = await runOnce("setup", [tsxCli(), join(ROOT, "prisma", "seed.ts")]);
  if (seedCode !== 0) log("⚠ Seeding reported a problem — you can re-run it later.");
  writeFileSync(FIRST_RUN_FLAG, new Date().toISOString(), "utf8");
  log("• Database ready.");
}

// The compiled app (.next) must exist before `next start` can serve it.
// We build with Webpack because Turbopack needs native SWC bindings that are
// unreliable on this platform (falls back to WASM, which Turbopack rejects).
async function ensureBuild(): Promise<void> {
  if (existsSync(join(ROOT, ".next", "BUILD_ID"))) return;
  log("");
  log("Compiling the app (first time only — this can take a few minutes)…");
  const buildCode = await runOnce("build", [nextCli(), "build", "--webpack"]);
  if (buildCode !== 0) throw new Error("next build failed — see output above.");
  log("• App compiled.");
}

async function checkPrereqs(): Promise<void> {
  if (!existsSync(join(ROOT, "realtime", "server.ts"))) {
    throw new Error(
      "This folder is missing the application files (realtime/server.ts not found). " +
        "It looks like an incomplete copy — re-extract the full package."
    );
  }
  // Validate the entries every child process needs, so we fail with one clear
  // message instead of dying halfway through startup.
  const required: [string, string[]][] = [
    ["tsx", ["dist/cli.mjs"]],
    ["next", ["dist/bin/next"]],
    ["prisma", ["build/index.js", "build/index.cjs"]],
  ];
  for (const [pkg, candidates] of required) {
    const ok = candidates.some((rel) => existsSync(join(NM, pkg, rel)));
    if (!ok) {
      throw new Error(
        `Bundled dependency "${pkg}" is missing. ` +
          "This folder is incomplete — re-extract the full offline package."
      );
    }
  }
  if (!existsSync(prismaSchemaPath())) {
    throw new Error("prisma/schema.prisma not found — the package is incomplete.");
  }
  if (!existsSync(join(ROOT, "prisma", "seed.ts"))) {
    throw new Error("prisma/seed.ts not found — the package is incomplete.");
  }
}

async function main() {
  log("");
  log("╔══════════════════════════════════════════════╗");
  log("║   Inter-Varsity Competition Platform         ║");
  log("║   Faculty of Science — offline server mode   ║");
  log("╚══════════════════════════════════════════════╝");

  await checkPrereqs();
  await ensureEnv();
  loadEnvIntoProcess();
  await setupDatabase();
  await ensureBuild();

  // NOTE: NEXT_PUBLIC_* is inlined into the JS bundle at *build* time, so
  // setting it here has no effect on the client. LAN address resolution is
  // handled in src/lib/realtime.ts → resolveRealtimeUrl(), which falls back to
  // window.location when the baked value points at localhost. We only need the
  // LAN IP here so we can print the address other devices should open.
  const lanIp = detectLanIp();

  log("");
  log("Starting the platform… (first start can take a minute)");
  log("");

  // Realtime service first, then Next.js once its port is ready.
  startProcess(
    "realtime",
    process.execPath,
    [pkgEntry("tsx", ["dist/cli.mjs"]), join(ROOT, "realtime", "server.ts")]
  );
  await waitForPort(RT_PORT).catch(() => log("⚠ Realtime port not confirmed yet — continuing."));
  startProcess(
    "next",
    process.execPath,
    [pkgEntry("next", ["dist/bin/next"]), "start", "-p", String(APP_PORT)]
  );
  await waitForPort(APP_PORT, 120_000).catch(() => log("⚠ App port not confirmed yet — check logs above."));

  log("");
  log("═══════════════════════════════════════════════");
  log("  The platform is RUNNING");
  log("═══════════════════════════════════════════════");
  log("");
  log("  Open on THIS computer:");
  log(`     http://localhost:${APP_PORT}`);
  log("");
  if (lanIp) {
    log("  Other devices on the same network open:");
    log(`     http://${lanIp}:${APP_PORT}`);
    log("");
    log("  (Make sure this computer's firewall allows");
    log("   inbound connections on ports " + APP_PORT + " and " + RT_PORT + ".)");
  } else {
    log("  ⚠ No LAN address detected — other devices cannot join.");
    log("    Connect this computer to the network and restart.");
  }
  log("");
  log("  Screen routes:  /admin   /gm   /screen   /join");
  log("");
  log("  Press Ctrl+C here to stop everything.");
  log("");
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((err) => {
  console.error("\n✖ Failed to start:", err instanceof Error ? err.message : err);
  log("If this keeps happening, delete .offline-initialized to force re-setup.");
  shutdown(1);
  setTimeout(() => process.exit(1), 1000);
});

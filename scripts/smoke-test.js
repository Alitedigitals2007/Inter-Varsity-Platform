#!/usr/bin/env node
// Boots the packaged app exactly the way a user would and checks that both
// services actually come up and answer.
//
// This is the real proof that the offline package is self-contained: it runs
// with the bundled Node, the bundled tsx, and the compiled .next — with no
// database and no developer tooling present.
//
// The database setup step is skipped (we drop a .offline-initialized marker),
// because a valid DATABASE_URL only exists on the operator's machine. Routes
// that need Postgres are therefore not exercised; this verifies boot + HTTP.
//
// Run:  npm run smoke-test   (after: npm run package)

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { packageDir } = require("./paths");

const PKG = packageDir();
const APP_PORT = Number(process.env.APP_PORT || 3000);
const BOOT_TIMEOUT_MS = 150_000;

function say(m) {
  console.log(m);
}

function fail(msg, detail) {
  console.error("\n✖ " + msg);
  if (detail) console.error(detail);
  console.error("");
  process.exitCode = 1;
}

function isFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "0.0.0.0");
  });
}

function waitFor(fn, timeoutMs, interval = 500) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await fn()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timed out"));
      setTimeout(tick, interval);
    };
    tick();
  });
}

async function httpOk(url, expectStatus) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (expectStatus) return res.status === expectStatus;
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Retries until the route returns the expected status (usually 200). */
async function pageOk(route, port) {
  try {
    await waitFor(() => httpOk(`http://127.0.0.1:${port}${route}`, 200), 45_000, 1000);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  say("\nSmoke-testing the offline package…\n  " + PKG + "\n");

  const required = [
    "Start Offline.bat",
    "scripts/offline.js",
    "scripts/offline.ts",
    "src/app/layout.tsx",
    "prisma/schema.prisma",
    "prisma/seed.ts",
    ".next/BUILD_ID",
    "node_modules/tsx/dist/cli.mjs",
    "node_modules/next/dist/bin/next",
  ];
  const missing = required.filter((r) => !fs.existsSync(path.join(PKG, ...r.split("/"))));
  if (missing.length) {
    fail("package is incomplete:\n    " + missing.join("\n    "), "Run:  npm run package");
    return;
  }

  // Ports must be genuinely free — the launcher treats "already in use" as
  // "ready", which would produce a false pass.
  if (!(await isFree(APP_PORT))) {
    fail(`port ${APP_PORT} is already in use — stop whatever holds it and retry.`);
    return;
  }
  say("  ✔ port " + APP_PORT + " is free");

  // Skip the interactive first-run flow (no database available here).
  const envPath = path.join(PKG, ".env");
  const flagPath = path.join(PKG, ".offline-initialized");
  const hadEnv = fs.existsSync(envPath);
  const hadFlag = fs.existsSync(flagPath);
  const envBackup = hadEnv ? fs.readFileSync(envPath) : null;
  const flagBackup = hadFlag ? fs.readFileSync(flagPath) : null;

  if (!hadEnv) {
    fs.writeFileSync(
      envPath,
      [
        'DATABASE_URL="postgresql://user:pass@localhost:5432/placeholder"',
        `SESSION_SECRET="${require("node:crypto").randomBytes(24).toString("hex")}"`,
        'SESSION_TTL_HOURS="24"',
        "",
      ].join("\n"),
      "utf8"
    );
  }
  if (!hadFlag) fs.writeFileSync(flagPath, new Date().toISOString(), "utf8");

  const nodeBin = path.join(PKG, "runtime", "node", "node.exe");
  const useBundled = fs.existsSync(nodeBin);
  const cmd = useBundled ? nodeBin : process.execPath;
  say("  • runtime: " + (useBundled ? "bundled runtime/node/node.exe" : "system node"));

  const launcher = path.join(PKG, "scripts", "offline.js");
  say("  • launching…\n");

  const child = spawn(cmd, [launcher], {
    cwd: PKG,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    shell: false,
    // On POSIX, give the launcher its own process group so killTree can take
    // the whole tree (launcher + next server) down. Windows uses taskkill /T.
    detached: process.platform !== "win32",
  });

  const log = [];
  const cap = (stream) => {
    if (!stream) return;
    stream.on("data", (c) => {
      const s = c.toString();
      log.push(s);
      process.stdout.write(s);
    });
  };
  cap(child.stdout);
  cap(child.stderr);

  const cleanupFiles = () => {
    try {
      if (!hadEnv && fs.existsSync(envPath)) fs.rmSync(envPath, { force: true });
      if (!hadFlag && fs.existsSync(flagPath)) fs.rmSync(flagPath, { force: true });
      if (hadEnv && envBackup) fs.writeFileSync(envPath, envBackup);
      if (hadFlag && flagBackup) fs.writeFileSync(flagPath, flagBackup);
    } catch {
      /* best effort */
    }
  };

  const killTree = () => {
    if (process.platform !== "win32") {
      // detached spawn above → the launcher is a process-group leader
      try {
        process.kill(-child.pid, "SIGKILL");
        return;
      } catch {
        /* fall through to the single kill */
      }
    } else {
      try {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        return;
      } catch {
        /* fall through to the single kill */
      }
    }
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  };

  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    child.exitCode = code;
  });

  let result = "ok";
  try {
    await waitFor(
      async () => {
        if (exited) throw new Error("launcher exited early (code " + child.exitCode + ")");
        return (await isFree(APP_PORT)) === false;
      },
      BOOT_TIMEOUT_MS,
      1000
    );
    say("\n  ✔ app port is listening");

    // Real pages must return 200 — a 404 or 500 would mean the app is not
    // actually serving, which a bare port check cannot tell apart.
    for (const route of ["/", "/login", "/join", "/screen"]) {
      const ok = await pageOk(route, APP_PORT);
      say((ok ? "  ✔ " : "  ✖ ") + `GET ${route}` + (ok ? "             → 200" : "            → not 200"));
      if (!ok && result === "ok") result = `route ${route} did not return 200`;
    }
  } catch (e) {
    result = e && e.message ? e.message : String(e);
  } finally {
    killTree();
    await new Promise((r) => setTimeout(r, 1500));
    cleanupFiles();
  }

  if (result === "ok") {
    say("\n✔ Smoke test PASSED — the package boots and serves.\n");
  } else {
    say("\n✖ Smoke test FAILED: " + result);
    say("\n--- last launcher output ---");
    say(log.slice(-40).join(""));
    say("");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  fail("smoke test crashed", e && e.stack ? e.stack : String(e));
});

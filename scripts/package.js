#!/usr/bin/env node
// Builds a self-contained offline package.
//
// Output: see scripts/paths.js — normally ./dist/InterVarsityPlatform/, but if
// this project lives inside OneDrive the artifacts go to
// %USERPROFILE%\Downloads\InterVarsityPlatform instead (writing ~1 GB into a
// OneDrive folder makes Windows re-sync every file as it is copied). Override
// with IVP_OUT=<absolute path>.
//
// The output is a folder you can copy to any Windows machine and double-click
// "Start Offline.bat" in. No Node install, no code editor, no internet at
// runtime.
//
// It bundles:
//   - the compiled Next.js app (.next)
//   - your source used at runtime (src/lib)
//   - node_modules (production deps + tsx to run the .ts launcher)
//   - a portable Node runtime (runtime/node) if present, else system Node
//   - Start Offline.bat + the launcher scripts
//
// Run:  npm run package
// Then: npm run verify-package

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { REPO, packageDir } = require("./paths");

const ROOT = REPO;
const OUT = packageDir();

function must(cond, msg) {
  if (!cond) {
    console.error("\n✖ " + msg + "\n");
    process.exit(1);
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/**
 * Recursive copy that survives transient file locks.
 *
 * OneDrive and antivirus software briefly hold handles on source files —
 * observed here in bulk on a re-run. A naive copyFileSync then either throws
 * (aborting the whole package) or, worse, leaves an incomplete tree. This
 * retries the whole tree — cheap, because already-copied files are simply
 * re-written — and fails loudly if anything is still unreadable.
 *
 * NOTE: this must NOT be what copyDirRetry calls, or the two would recurse.
 */
function copyDir(src, dest, filter) {
  const failed = copyDirRetry(src, dest, filter);
  must(
    failed.length === 0,
    "Could not copy " + failed.length + " file(s) from " + src + "\n" +
      "First failure: " + (failed[0] || "") +
      "\nClose anything holding this folder open (OneDrive / antivirus) and re-run."
  );
}

// Native, multithreaded copying — dramatically faster than a per-file Node
// loop on a large tree (the pure-Node path measured ~19 files/sec here).
//
// robocopy reports success with exit codes 0–7; 8+ means something failed.
// On this machine OneDrive and Defender transiently hold handles on source
// files, so individual copies fail with "being used by another process" —
// observed here in bulk. One pass is therefore not trustworthy: we re-run
// until robocopy reports clean. Re-running is cheap, because robocopy skips
// files that are already byte-identical.
const ROBO_PASSES = 4;

function robocopyDir(src, dest, excludeDirs) {
  // /MT:16 — the measured bottleneck is per-file open overhead (~18 files/sec
  // at 0.6% CPU: each read is scanned by Defender/OneDrive), NOT bytes on the
  // wire. That is the specific shape multithreading fixes: 33k files drop from
  // ~30 minutes to a few. It is harmless alongside /R:3 — a retried file is
  // simply re-queued.
  const args = [
    src, dest, "/E", "/COPY:DAT", "/DCOPY:T",
    "/R:3", "/W:2", "/MT:16", "/NFL", "/NDL", "/NP",
  ];
  if (excludeDirs && excludeDirs.length) args.push("/XD", ...excludeDirs);

  for (let pass = 1; pass <= ROBO_PASSES; pass++) {
    const rc = spawnSync("robocopy", args, { stdio: "inherit", windowsHide: true });
    if (rc.error || rc.status == null) return false;
    if (rc.status < 8) return true;
    console.log(
      "  • robocopy pass " + pass + "/" + ROBO_PASSES + " had copy failures (exit " +
        rc.status + ") — re-running"
    );
  }
  return false;
}

// Last-resort path when robocopy is unavailable: same semantics as copyDir,
// but records files it could not copy instead of throwing, and re-walks the
// tree so locked files get several chances.
function copyDirSafe(src, dest, filter, failed) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (filter && !filter(s, entry)) continue;
    if (entry.isDirectory()) copyDirSafe(s, d, filter, failed);
    else {
      try {
        fs.copyFileSync(s, d);
      } catch {
        failed.push(s);
      }
    }
  }
}

function copyDirRetry(src, dest, filter) {
  let failed = [];
  for (let pass = 1; pass <= ROBO_PASSES; pass++) {
    failed = [];
    copyDirSafe(src, dest, filter, failed);
    if (!failed.length) return [];
    console.log(
      "  • built-in copy pass " + pass + "/" + ROBO_PASSES + " had " + failed.length +
        " locked file(s) — retrying"
    );
  }
  return failed;
}

function main() {
  console.log("\nPackaging the offline platform…\n");

  must(
    fs.existsSync(path.join(ROOT, ".next", "BUILD_ID")),
    "No valid .next build found (missing .next/BUILD_ID). Run \"npm run build\" first."
  );
  must(fs.existsSync(path.join(ROOT, "node_modules")), "node_modules missing. Run \"npm install\" first.");
  // tsx runs the offline launcher and the first-run seed (.ts), so it must
  // be a production dependency or the packaged app won't start.
  must(
    fs.existsSync(path.join(ROOT, "node_modules", "tsx")),
    "tsx is not installed. Run \"npm install\" first (it must be a runtime dep)."
  );
  // The Prisma client must be genuinely generated (a stub is only a few KB).
  // Without this, every `prisma.*` call in the packaged app throws at runtime.
  const genDts = path.join(ROOT, "node_modules", ".prisma", "client", "index.d.ts");
  must(fs.existsSync(genDts), "Prisma client not generated. Run \"npm run db:generate\" first.");
  must(
    fs.statSync(genDts).size > 100_000,
    "Prisma client looks like an ungenerated stub. Run \"npm run db:generate\" first."
  );
  // The portable runtime is what makes this work on a laptop with no Node.
  if (!fs.existsSync(path.join(ROOT, "runtime", "node", "node.exe"))) {
    console.warn(
      "  ⚠ No portable Node at runtime/node — the target machine will need Node installed."
    );
  }

  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  // 1. Compiled app
  console.log("  • copying compiled app (.next)");
  copyDir(path.join(ROOT, ".next"), path.join(OUT, ".next"));

  // 2. Static config Next needs at runtime
  for (const f of ["package.json", "next.config.ts", "tsconfig.json"]) {
    if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
  }

  // 3. App source used at runtime (lib imports + launcher scripts)
  console.log("  • copying runtime source");
  copyDir(path.join(ROOT, "src", "lib"), path.join(OUT, "src", "lib"));
  // Only the runtime scripts ship. The rest of this folder (package.js,
  // make-installer.js, paths.js, smoke-test.js, verify-package.js) is build
  // tooling and has no business on an end user's machine.
  const RUNTIME_SCRIPTS = new Set(["offline.js", "offline.ts", "lan.ts"]);
  copyDir(path.join(ROOT, "scripts"), path.join(OUT, "scripts"), (s, entry) =>
    entry.isDirectory() ? true : RUNTIME_SCRIPTS.has(path.basename(s))
  );

  // 4. Prisma (schema + seed). NOTE: seed.ts is required at first-run, so we
  // copy the whole prisma/ folder — never filter out .ts here.
  console.log("  • copying prisma assets");
  must(
    fs.existsSync(path.join(ROOT, "prisma", "seed.ts")),
    "prisma/seed.ts missing — the offline first-run seed would fail."
  );
  copyDir(path.join(ROOT, "prisma"), path.join(OUT, "prisma"));

  // 5. Dependencies
  //
  // We do NOT use `npm prune --omit=dev` here: the offline launcher and the
  // first-run seed are TypeScript and are executed by tsx at runtime, so
  // pruning devDependencies would strip tsx and break startup.
  //
  // robocopy is used because it is a native, multithreaded copier: the naive
  // per-file fs.copyFileSync loop was measured at ~19 files/sec here and a
  // 35k-file tree did not finish in 30 minutes.
  console.log("  • copying node_modules (this can take a few minutes)");
  const nmSrc = path.join(ROOT, "node_modules");
  const nmDst = path.join(OUT, "node_modules");

  // Prisma leaves dot-prefixed staging dirs with random suffixes
  // (node_modules/@prisma/.composer-cli-*, .query-plan-executor-*, …). Verified:
  // no file in any real @prisma package references them. ~75 MB of dead weight
  // holding the only paths that exceed Windows' MAX_PATH, so they are skipped.
  const staging = [];
  try {
    staging.push(
      ...fs
        .readdirSync(path.join(nmSrc, "@prisma"), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith("."))
        .map((e) => path.join(nmSrc, "@prisma", e.name))
    );
  } catch {
    /* @prisma may be absent */
  }

  const nmOk = robocopyDir(nmSrc, nmDst, [".cache", ".next", ...staging]);
  if (!nmOk) {
    console.log("  • robocopy failed — falling back to built-in copy");
    rmrf(nmDst);
    const failed = copyDirRetry(nmSrc, nmDst, (s, entry) => {
      const base = path.basename(s);
      if (base === ".cache" || base === ".next") return false;
      if (
        entry.isDirectory() &&
        base.startsWith(".") &&
        /[\\/]node_modules[\\/]@prisma$/.test(path.dirname(s))
      ) {
        return false;
      }
      return true;
    });
    must(
      failed.length === 0,
      "Could not copy " + failed.length + " file(s), so the package would be incomplete.\n" +
        "First failure: " + (failed[0] || "") +
        "\nClose anything holding this folder open (OneDrive / antivirus) and re-run."
    );
  }

  // Belt and braces: guarantee no staging dir landed in the output.
  try {
    for (const d of fs.readdirSync(path.join(nmDst, "@prisma"))) {
      if (d.startsWith(".")) rmrf(path.join(nmDst, "@prisma", d));
    }
  } catch {
    /* @prisma may be absent */
  }

  // 6. Portable Node runtime, if the operator staged one at runtime/node
  const portableNode = path.join(ROOT, "runtime", "node");
  if (fs.existsSync(path.join(portableNode, "node.exe"))) {
    console.log("  • bundling portable Node runtime");
    const rtDst = path.join(OUT, "runtime", "node");
    if (!robocopyDir(portableNode, rtDst)) {
      rmrf(rtDst);
      const failed = copyDirRetry(portableNode, rtDst);
      must(
        failed.length === 0,
        "Could not copy " + failed.length + " file(s) of the bundled Node runtime.\n" +
          "First failure: " + (failed[0] || "") +
          "\nClose anything holding this folder open (OneDrive / antivirus) and re-run."
      );
    }
    // node.exe is the single file that makes the target laptop independent of
    // any installed Node — never ship a package without it.
    must(
      fs.existsSync(path.join(rtDst, "node.exe")),
      "Bundled Node runtime did not copy correctly (node.exe missing). Re-run: npm run package"
    );
  } else {
    console.log("  • no portable Node staged — target machine needs Node installed");
  }

  // 7. Double-click entry point
  fs.copyFileSync(path.join(ROOT, "Start Offline.bat"), path.join(OUT, "Start Offline.bat"));

  console.log("\n✔ Offline package ready at:\n    " + OUT + "\n");
  console.log("Copy that whole folder to any Windows machine and double-click");
  console.log('"Start Offline.bat". It will ask for your database URL once.');
}

main();

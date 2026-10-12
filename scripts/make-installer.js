#!/usr/bin/env node
// Builds the single-file Windows installer:
//
//     <Setup.exe stub> + <marker> + <payload.zip>
//     →  dist/Inter-Varsity-Platform-Setup.exe
//
// Double-click that one file on any Windows laptop: it extracts the platform,
// creates Desktop/Start Menu shortcuts, writes an Uninstall.bat, and offers to
// launch. No Node, no code editor, no internet needed on the target machine.
//
// Prerequisite:  npm run build   &&   npm run package
// Run:           npm run installer

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { REPO, packageDir, distDir, installerPath } = require("./paths");

const ROOT = REPO;
const PKG = packageDir();
const DIST = distDir();

const STUB_SRC = path.join(ROOT, "installer", "Setup.cs");

// Unique per build run. An aborted build can leave an orphaned process
// holding the previous artifact open — that happened repeatedly here and made
// the next run fail with "the process cannot access the file". A fixed name
// guarantees a collision; a unique one means a stale lock can never be hit.
const RUN_ID = process.pid + "-" + Date.now().toString(36);

// The bare stub and the archive are built in the user temp dir, never in the
// repo or Downloads. The stub used to land at installer/Setup.exe, where it
// sat forever as a runnable-looking 14 KB .exe with no payload — guaranteed
// to fail with "the application payload is missing" if anyone double-clicked
// it. Any legacy copy is deleted after assembly so that trap cannot reappear.
const STUB_EXE = path.join(os.tmpdir(), "ivp-stub-" + RUN_ID + ".exe");
const PAYLOAD_ZIP = path.join(os.tmpdir(), "ivp-payload-" + RUN_ID + ".zip");
const OUT_EXE = installerPath();
const LEGACY_STUB = path.join(ROOT, "installer", "Setup.exe");

const CSC =
  path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");

// Must stay byte-for-byte in sync with installer/Setup.cs → BuildMagic().
const MARKER_SEED = "InterVarsityPlatformSetup!2026";
const MARKER_XOR = 0x5a;

function fail(msg) {
  console.error("\n✖ " + msg + "\n");
  process.exit(1);
}

function buildMarker() {
  const seed = Buffer.from(MARKER_SEED, "ascii");
  const out = Buffer.alloc(seed.length);
  for (let i = 0; i < seed.length; i++) out[i] = seed[i] ^ MARKER_XOR;
  return out;
}

function compileStub() {
  console.log("  • compiling installer stub");
  if (!fs.existsSync(CSC)) {
    fail(
      "csc.exe not found at:\n    " + CSC +
        "\nThis installer uses the .NET Framework compiler bundled with Windows."
    );
  }
  const res = spawnSync(
    CSC,
    [
      "/nologo",
      "/target:exe",
      "/optimize+",
      "/out:" + STUB_EXE,
      STUB_SRC,
      "/r:System.IO.Compression.dll",
      "/r:System.IO.Compression.FileSystem.dll",
      "/r:System.dll",
      "/r:System.Core.dll",
    ],
    { encoding: "utf8", stdio: "inherit" }
  );
  if (res.status !== 0) fail("stub compilation failed (see output above).");
}

const TAR =
  path.join(process.env.WINDIR || "C:\\Windows", "System32", "tar.exe");

// Counts files in a directory tree without loading anything into memory.
function countFiles(dir) {
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) stack.push(path.join(d, e.name));
      else n++;
    }
  }
  return n;
}

// Reads the zip's central directory (a single region at the end of the file)
// and returns how many entries it declares. Opening is cheap even though the
// archive is huge — the entry headers are NOT touched.
function zipEntryCount(zipPath) {
  const script = path.join(os.tmpdir(), "ivp-zipcheck.ps1");
  const q = (p) => "'" + p.replace(/'/g, "''") + "'";
  fs.writeFileSync(
    script,
    [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      "$z = [System.IO.Compression.ZipFile]::OpenRead(" + q(zipPath) + ")",
      "Write-Output ('entries=' + $z.Entries.Count)",
      "$z.Dispose()",
    ].join("\r\n"),
    "utf8"
  );
  const res = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { encoding: "utf8" }
  );
  const m = /entries=(\d+)/.exec(res.stdout || "");
  return m ? Number(m[1]) : -1;
}

function zipWithNet() {
  const ps1 = path.join(os.tmpdir(), "ivp-zip.ps1");
  const q = (p) => "'" + p.replace(/'/g, "''") + "'";
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "if (Test-Path " + q(PAYLOAD_ZIP) + ") { Remove-Item " + q(PAYLOAD_ZIP) + " -Force }",
    "[System.IO.Compression.ZipFile]::CreateFromDirectory(" +
      q(PKG) + "," + q(PAYLOAD_ZIP) +
      ",[System.IO.Compression.CompressionLevel]::Optimal,$false)",
    "Write-Output ('zip-bytes=' + (Get-Item " + q(PAYLOAD_ZIP) + ").Length)",
  ].join("\r\n");

  fs.writeFileSync(ps1, script, "utf8");
  const res = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
    { encoding: "utf8", stdio: "inherit" }
  );
  return res.status === 0 && fs.existsSync(PAYLOAD_ZIP);
}

function zipPayload() {
  console.log("  • compressing the package (this can take a few minutes)");
  try {
    fs.rmSync(PAYLOAD_ZIP, { force: true });
  } catch {
    /* ignore */
  }

  // Windows' bundled bsdtar writes a standard ZIP (format inferred from the
  // extension) and is dramatically faster than System.IO.Compression on this
  // machine. MEASURED on the same 434-file subset:
  //
  //     .NET ZipFile   59.7s   (~200 ms per file)
  //     tar.exe        12.2s   (~28 ms per file)
  //
  // The cost is per FILE, not per byte — real-time scanning opens each one —
  // so it dominates completely. At .NET's rate the full 35,888-file package
  // was projected at 12+ hours and never completed; tar finishes in ~17 min.
  let usedTar = false;
  let tarRan = false;
  if (fs.existsSync(TAR)) {
    tarRan = true;
    const r = spawnSync(TAR, ["-a", "-c", "-f", PAYLOAD_ZIP, "-C", PKG, "."], {
      stdio: "inherit",
      windowsHide: true,
    });
    usedTar = r.status === 0 && fs.existsSync(PAYLOAD_ZIP);
  }

  if (!usedTar) {
    console.log(
      tarRan
        ? "  • tar.exe could not write the archive — falling back to .NET ZipFile (much slower)"
        : "  • tar.exe unavailable — falling back to .NET ZipFile (much slower)"
    );
    if (!zipWithNet()) {
      fail(
        "creating the archive failed.\n" +
          "If the message above mentions MAX_PATH, a path exceeds Windows' 260\n" +
          "character limit — re-run:  npm run package\n" +
          "Otherwise a file was locked while it was read. Close anything using\n" +
          "the package folder, then re-run:  npm run installer"
      );
    }
  }

  // A truncated archive is exactly the failure that produces an installer
  // which extracts to nothing. Verify the central directory is readable AND
  // that it declares at least as many entries as the package has files
  // (archives also contain directory entries, so >= is the correct test).
  console.log("  • verifying the archive");
  const expected = countFiles(PKG);
  const actual = zipEntryCount(PAYLOAD_ZIP);
  if (actual < expected) {
    fail(
      "archive looks truncated: it declares " + actual + " entries but the\n" +
        "package contains " + expected + " files.\n" +
        "Re-run:  npm run installer"
    );
  }
  console.log("    archive entries: " + actual + " (package files: " + expected + ")");
}

function assemble(marker) {
  console.log("  • assembling single-file installer");
  const stub = fs.readFileSync(STUB_EXE);

  // Guard: the marker must be unique to the payload region. If it ever showed
  // up inside the stub, FindMagic() would report a bogus offset and the
  // installer would refuse to open the archive.
  if (stub.indexOf(marker) !== -1) {
    fail(
      "marker already occurs inside the compiled stub.\n" +
        "Change MARKER_SEED here AND BuildMagic() in installer/Setup.cs."
    );
  }

  const zipSize = fs.statSync(PAYLOAD_ZIP).size;
  const out = fs.createWriteStream(OUT_EXE);
  out.write(stub);
  out.write(marker);
  const zip = fs.createReadStream(PAYLOAD_ZIP);
  zip.pipe(out, { end: false });
  zip.on("end", () => out.end());
  return new Promise((resolve, reject) => {
    out.on("close", () => {
      const total = fs.statSync(OUT_EXE).size;
      const ok = total === stub.length + marker.length + zipSize;
      if (!ok) fail("assembly size mismatch (expected " + (stub.length + marker.length + zipSize) + ", got " + total + ").");
      resolve({ stub: stub.length, marker: marker.length, zip: zipSize, total });
    });
    out.on("error", reject);
    zip.on("error", reject);
  });
}

function human(n) {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + " MB";
  return (n / 1024).toFixed(1) + " KB";
}

async function main() {
  console.log("\nBuilding the single-file installer…\n");

  if (!fs.existsSync(path.join(PKG, "Start Offline.bat"))) {
    fail('Package not found (missing "' + path.join(PKG, "Start Offline.bat") + '").\nRun:  npm run package');
  }
  if (!fs.existsSync(STUB_SRC)) fail("installer/Setup.cs is missing.");
  if (!fs.existsSync(PKG)) {
    fail("Offline package not found at:\n    " + PKG + "\nRun:  npm run package");
  }

  // Refuse to ship anything that could carry credentials. The smoke test drops
  // a .env and a .offline-initialized marker into the package so it can skip
  // the interactive first run — if that test is interrupted (or crashes) those
  // files are left behind and would otherwise be baked into the installer.
  for (const forbidden of [".env", ".offline-initialized"]) {
    if (fs.existsSync(path.join(PKG, forbidden))) {
      fail(
        '"' +
          forbidden +
          '" is still inside the package and can carry credentials.\n' +
          "Delete it, then re-run:  npm run package"
      );
    }
  }

  fs.mkdirSync(DIST, { recursive: true });

  compileStub();
  const marker = buildMarker();
  zipPayload();
  const sizes = await assemble(marker);

  // Dispose of every intermediate, including the old bare stub at
  // installer/Setup.exe. Leaving it behind is what made a broken 14 KB
  // installer look like the real deliverable.
  for (const intermediate of [PAYLOAD_ZIP, STUB_EXE, LEGACY_STUB]) {
    try {
      fs.rmSync(intermediate, { force: true });
    } catch {
      /* disposable */
    }
  }

  console.log("\n✔ Installer ready:\n    " + OUT_EXE);
  console.log(
    "    stub " + human(sizes.stub) +
      "  +  payload " + human(sizes.zip) +
      "  =  " + human(sizes.total)
  );
  console.log("\nCopy that ONE file to any Windows laptop and double-click it.\n");
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));

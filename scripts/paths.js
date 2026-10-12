// Shared output locations for the offline package + installer.
//
// WHY THIS EXISTS: build artifacts total ~1 GB. If this project lives inside a
// OneDrive-synced folder (Desktop and Documents are redirected there by
// default), writing them in-tree makes Windows re-upload every file while it is
// being copied — measured at ~19 files/sec, so a 35k-file copy never finished
// in 30 minutes. We therefore place outputs in a local, non-synced folder and
// let all three tools (package / verify-package / installer) agree on it.
//
// Override anytime with:   IVP_OUT=<absolute path>

const os = require("node:os");
const path = require("node:path");

const REPO = path.join(__dirname, "..");

function isOneDrivePath(p) {
  return /(^|[\\/])OneDrive/i.test(p.replace(/\\/g, "/"));
}

function packageDir() {
  if (process.env.IVP_OUT) return path.resolve(process.env.IVP_OUT);

  if (isOneDrivePath(REPO)) {
    const home = process.env.USERPROFILE || os.homedir();
    return path.join(home, "Downloads", "InterVarsityPlatform");
  }
  return path.join(REPO, "dist", "InterVarsityPlatform");
}

function distDir() {
  return path.dirname(packageDir());
}

function installerPath() {
  return path.join(distDir(), "Inter-Varsity-Platform-Setup.exe");
}

module.exports = { REPO, packageDir, distDir, installerPath, isOneDrivePath };

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

function safe(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const commit = safe("git rev-parse HEAD");
const shortCommit = safe("git rev-parse --short HEAD") || commit.slice(0, 7);
const commitDate = safe("git log -1 --format=%cI");
const commitMsg = safe("git log -1 --format=%s");
const branch = safe("git rev-parse --abbrev-ref HEAD");

const info = {
  commit,
  shortCommit,
  commitDate: commitDate || null,
  commitMsg: commitMsg || "",
  branch: branch || "",
  builtAt: new Date().toISOString(),
};

try {
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/build-info.json", JSON.stringify(info, null, 2));
  console.log(`[build-info] dist/build-info.json -> ${shortCommit || "?"} (${commitDate || "sem data"})`);
} catch (e) {
  console.warn("[build-info] falha ao gravar:", e.message);
}

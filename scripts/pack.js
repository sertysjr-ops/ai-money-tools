#!/usr/bin/env node
/**
 * Pack the shippable product: dist/dani-tools-<version>.zip
 *
 * Stages exactly what a paying customer needs — the 8 CLIs, dispatcher,
 * shared libs, automation server, config example, completions, install
 * guide, Gumroad listing copy, license — and zips it. Source-only dirs
 * (test/, extension/, .git, node_modules) never ship.
 *
 * Run: node scripts/pack.js   (or: npm run pack)
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(DIST, "dani-tools");
const ZIP = path.join(DIST, `dani-tools-${pkg.version}.zip`);

// what ships, repo-relative
const SHIP = [
  "bin",
  "lib",
  "tools",
  "completions",
  "serve.js",
  "package.json",
  "README.md",
  "LICENSE",
  "dani-tools.config.example.json",
  "prompt-library",
  ["marketing/INSTALL.md", "INSTALL.md"],   // [src, staged-as]
  ["marketing/LISTING.md", "LISTING.md"],
];

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copy(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

rmrf(STAGE);
rmrf(ZIP);
fs.mkdirSync(STAGE, { recursive: true });

let files = 0;
for (const item of SHIP) {
  const [src, staged] = Array.isArray(item) ? item : [item, item];
  const from = path.join(ROOT, src);
  if (!fs.existsSync(from)) {
    console.error(`❌ missing ship item: ${src}`);
    process.exit(1);
  }
  copy(from, path.join(STAGE, staged));
}

// sanity: every bin entry in package.json must exist in the staging area
for (const rel of Object.values(pkg.bin)) {
  if (!fs.existsSync(path.join(STAGE, rel))) {
    console.error(`❌ staged package is missing bin target: ${rel}`);
    process.exit(1);
  }
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}
files = countFiles(STAGE);

// zip the staging dir so it unpacks as dani-tools/...
execFileSync("zip", ["-qr", ZIP, "dani-tools"], { cwd: DIST });
rmrf(STAGE);

const kb = (fs.statSync(ZIP).size / 1024).toFixed(1);
console.log(`📦 ${path.basename(ZIP)} — ${files} files, ${kb} KB`);

#!/usr/bin/env node
/**
 * Pack test: run scripts/pack.js and verify the shippable zip.
 *
 * - zip exists and unpacks as dani-tools/
 * - every bin target from package.json is inside
 * - marketing + license files ship
 * - source-only dirs (test/, extension/, node_modules, .git) do NOT
 *
 * Run: node test/pack.test.js
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));
const ZIP = path.join(ROOT, "dist", `dani-tools-${pkg.version}.zip`);

let passed = 0;
function check(name, cond, extra = "") {
  if (!cond) {
    console.error(`❌ ${name} ${extra}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${name}`);
    passed++;
  }
}

// build the artifact
const out = execFileSync("node", [path.join(ROOT, "scripts", "pack.js")], {
  encoding: "utf8",
});
check("pack.js runs and reports", /📦 dani-tools-.*files, .*KB/.test(out), out.trim());
check("zip exists at dist/", fs.existsSync(ZIP));

// list contents (-Z1 = names only, no columns to parse)
const listing = execFileSync("unzip", ["-Z1", ZIP], { encoding: "utf8" });
const names = new Set(listing.split("\n").map((l) => l.trim()).filter(Boolean));

for (const rel of Object.values(pkg.bin)) {
  check(`bin target ships: ${rel}`, names.has(`dani-tools/${rel}`));
}
for (const must of [
  "dani-tools/lib/ollama.js",
  "dani-tools/lib/config.js",
  "dani-tools/serve.js",
  "dani-tools/playground.html",
  "dani-tools/package.json",
  "dani-tools/README.md",
  "dani-tools/LICENSE",
  "dani-tools/INSTALL.md",
  "dani-tools/LISTING.md",
  "dani-tools/dani-tools.config.example.json",
  "dani-tools/prompt-library/README.md",
  "dani-tools/prompt-library/viral-creator.config.json",
  "dani-tools/prompt-library/indie-hacker.config.json",
  "dani-tools/prompt-library/agency-pro.config.json",
  "dani-tools/prompt-library/technical-founder.config.json",
  "dani-tools/prompt-library/ghostwriter-li.config.json",
]) {
  check(`ships ${must}`, names.has(must));
}
for (const banned of ["test/", "extension/", "node_modules/", ".git/", "dist/"]) {
  check(
    `does NOT ship ${banned}`,
    ![...names].some((n) => n.includes(banned))
  );
}

// real unpack smoke: staged package.json parses, a tool --help runs offline
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dani-pack-"));
execFileSync("unzip", ["-q", ZIP, "-d", tmp]);
const stagedPkg = JSON.parse(
  fs.readFileSync(path.join(tmp, "dani-tools", "package.json"), "utf8")
);
check("unzipped package.json parses, version matches", stagedPkg.version === pkg.version);
const help = execFileSync(
  "node",
  [path.join(tmp, "dani-tools", "tools", "quotemine", "cli.js"), "--help"],
  { encoding: "utf8" }
);
check("unzipped tool runs --help (no Ollama needed)", help.length > 50);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} pack checks passed`);

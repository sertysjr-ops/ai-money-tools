#!/usr/bin/env node
/**
 * Prompt-library gate: every pack must be (a) valid JSON, (b) structurally
 * a dani-tools config, and (c) parser-safe — each tool's output-format
 * contract must survive the persona rewrite, or its parser starves.
 *
 * Ends with one LIVE proof: hookline under the viral-creator pack must
 * actually produce numbered hooks (override path end-to-end).
 *
 * Run: node test/prompt-library.test.js
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "prompt-library");
const KNOWN_TOOLS = [
  "threadsmith", "quotemine", "replyguy", "changelogify",
  "hookline", "namelab", "faqforge", "altmaker", "pitchforge",
];

// the output-contract fingerprints each tool's parser relies on
const CONTRACTS = {
  threadsmith: [/280/, /thread and nothing else/i],
  quotemine: [/numbered list/i, /no commentary/i],
  hookline: [/numbered list/i, /no commentary/i],
  namelab: [/numbered list/i, /no blank lines/i],
  faqforge: [/Q: <question>/, /A: <answer>/],
  altmaker: [/\[brackets\]/, /em-dash/, /numbered list/i],
  changelogify: [/never invent features/i],
  replyguy: [/filler/, /sycophancy/],
  pitchforge: [/numbered list/i, /no commentary/i],
};

let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) {
    console.error(`❌ ${msg}`);
    process.exit(1);
  }
}

const packs = fs.readdirSync(LIB).filter((f) => f.endsWith(".config.json"));
ok(packs.length === 5, `expected 5 packs, found ${packs.length}: ${packs}`);
console.log(`packs: ${packs.map((p) => p.replace(".config.json", "")).join(", ")}`);

for (const file of packs) {
  const full = path.join(LIB, file);
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (e) {
    ok(false, `${file}: invalid JSON — ${e.message}`);
    continue;
  }
  ok(cfg && typeof cfg === "object" && !Array.isArray(cfg),
    `${file}: not a JSON object`);

  // every known tool gets a persona prompt; no unknown tool names sneak in
  const prompts = cfg.prompts || {};
  for (const t of KNOWN_TOOLS) {
    const p = prompts[t];
    ok(p && typeof p.system === "string" && p.system.trim().length > 80,
      `${file}: prompts.${t}.system missing or suspiciously short`);
    // contract fingerprint must survive the rewrite
    for (const re of CONTRACTS[t] || []) {
      ok(re.test(p.system),
        `${file}: prompts.${t} breaks the output contract — missing ${re}`);
    }
  }
  for (const k of Object.keys(prompts)) {
    ok(KNOWN_TOOLS.includes(k), `${file}: unknown tool in prompts: ${k}`);
  }

  // defaults, when present, target known tools with flat objects
  for (const [t, d] of Object.entries(cfg.defaults || {})) {
    ok(KNOWN_TOOLS.includes(t), `${file}: unknown tool in defaults: ${t}`);
    ok(d && typeof d === "object" && !Array.isArray(d),
      `${file}: defaults.${t} must be a flat object`);
  }
  console.log(`✅ ${file}: 8/8 personas present, contracts intact`);
}

// --print-config resolves a pack via DANI_TOOLS_CONFIG (zero-Ollama path)
const printed = execFileSync(
  process.execPath,
  [path.join(ROOT, "bin", "dani-tools.js"), "hookline", "--print-config"],
  { env: { ...process.env, DANI_TOOLS_CONFIG: path.join(LIB, "viral-creator.config.json") }, encoding: "utf8" }
);
ok(/viral-creator\.config\.json/.test(printed),
  `--print-config did not resolve the pack:\n${printed.slice(0, 300)}`);
ok(/"promptOverride": true/.test(printed),
  `--print-config shows no active prompt override:\n${printed.slice(0, 300)}`);
ok(/"voice": "punchy"/.test(printed),
  `--print-config missing the pack's flag defaults:\n${printed.slice(0, 300)}`);
console.log("✅ --print-config resolves a pack via DANI_TOOLS_CONFIG");

// LIVE: the override must reach the model end-to-end. hookline under the
// viral-creator pack defaults to 10 punchy hooks — ask for 3 and require
// a numbered list back (proves prompt + defaults pipeline both work).
const out = execFileSync(
  process.execPath,
  [path.join(ROOT, "bin", "dani-tools.js"), "hookline", "--count", "3"],
  {
    env: { ...process.env, DANI_TOOLS_CONFIG: path.join(LIB, "viral-creator.config.json") },
    input: "a free app that turns your camera roll into a printed photo book",
    encoding: "utf8",
    timeout: 120000,
  }
);
const numbered = out.split("\n").filter((l) => /^\s*\d+[.)]/.test(l));
ok(numbered.length >= 3,
  `live hookline under pack produced ${numbered.length} numbered hooks:\n${out.slice(0, 400)}`);
console.log(`✅ LIVE: viral-creator pack → ${numbered.length} numbered hooks`);
console.log(`   sample: ${numbered[0].trim().slice(0, 90)}`);

console.log(`\n✅ prompt-library: all ${checks} checks PASS`);

#!/usr/bin/env node
/**
 * run-all — smoke-test every tool against the live local model.
 *
 * Each tool gets a tiny canned input and must exit 0 with non-trivial
 * stdout. Not a quality gate — a wiring gate: catches broken requires,
 * dead Ollama, malformed flags, empty model output.
 *
 * Usage:
 *   node test/run-all.js              # all tools
 *   node test/run-all.js namelab hookline   # subset
 *   npm test
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = path.join(__dirname, "..");

const SAMPLES = {
  quotemine:
    "Most people overestimate what they can do in a day and underestimate what they can do in a decade. " +
    "The best time to plant a tree was twenty years ago; the second best time is today. " +
    "You do not rise to the level of your ambitions; you fall to the level of your systems.",
  replyguy: "Hot take: TypeScript is just JavaScript with extra homework and everyone knows it.",
  threadsmith:
    "Building software locally with AI is suddenly viable. Small language models run on laptops, " +
    "whisper transcribes speech offline, and synthetic voices sound human. The economics flip: " +
    "instead of renting intelligence by the token, you own it outright. Privacy becomes a feature, " +
    "not a tradeoff.",
};

const CASES = [
  {
    tool: "threadsmith",
    args: ["--tweets", "5"],
    stdin: SAMPLES.threadsmith,
    minChars: 120,
  },
  {
    tool: "quotemine",
    args: ["--count", "3"],
    stdin: SAMPLES.quotemine,
    minChars: 60,
  },
  {
    tool: "replyguy",
    args: ["--count", "2", "--tone", "witty"],
    stdin: SAMPLES.replyguy,
    minChars: 60,
  },
  {
    tool: "changelogify",
    args: ["--style", "concise", "--version", "9.9.9-test"],
    cwd: ROOT, // needs git history
    minChars: 80,
  },
  {
    tool: "hookline",
    args: ["offline AI voice assistant for developers", "--count", "3"],
    minChars: 60,
  },
  {
    tool: "namelab",
    args: ["offline AI voice assistant for developers", "--count", "4", "--style", "startup"],
    minChars: 60,
  },
  {
    tool: "faqforge",
    args: ["--count", "4", "--style", "docs", "--out",
      path.join(os.tmpdir(), "faqforge-test.html")],
    stdin: "# Demo App\n\nDemo App stores your notes locally and syncs them between " +
      "devices over encrypted peer-to-peer connections. Free tier: 3 devices, " +
      "500 notes. Pro: unlimited devices, shared workspaces, priority support.",
    minChars: 20,
  },
  {
    tool: "altmaker",
    args: ["offline AI tools are the future of indie hacking", "--count", "3", "--kind", "all"],
    minChars: 80,
  },
];

const TIMEOUT_MS = 120000;

function runCase(c) {
  const cli = path.join(ROOT, "tools", c.tool, "cli.js");
  if (!fs.existsSync(cli)) {
    return { ok: false, detail: `missing ${cli}` };
  }
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [cli, ...c.args], {
    input: c.stdin ?? "",
    cwd: c.cwd ?? os.tmpdir(),
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (res.error?.code === "ETIMEDOUT") {
    return { ok: false, detail: `timeout after ${TIMEOUT_MS / 1000}s` };
  }
  if (res.status !== 0) {
    const errTail = (res.stderr || "").trim().split("\n").slice(-2).join(" ");
    return { ok: false, detail: `exit ${res.status}: ${errTail}` };
  }
  const out = (res.stdout || "").trim();
  if (out.length < c.minChars) {
    return { ok: false, detail: `output too short (${out.length} < ${c.minChars} chars)` };
  }
  return { ok: true, detail: `${out.length} chars in ${dt}s`, preview: out.split("\n")[0] };
}

function main() {
  // preflight: is Ollama up?
  try {
    const r = spawnSync("curl", ["-s", "-m", "3", "http://localhost:11434/api/tags"], { encoding: "utf8" });
    if (r.status !== 0 || !r.stdout.includes("qwen")) {
      console.error("⚠ Ollama not reachable at localhost:11434 — start it: ollama serve");
      process.exit(1);
    }
  } catch {
    console.error("⚠ curl not available for preflight");
    process.exit(1);
  }

  const filter = process.argv.slice(2);
  const cases = filter.length
    ? CASES.filter((c) => filter.includes(c.tool))
    : CASES;

  if (cases.length === 0) {
    console.error(`unknown tool(s): ${filter.join(", ")} — one of: ${CASES.map((c) => c.tool).join(", ")}`);
    process.exit(1);
  }

  let failed = 0;
  console.log(`smoke-testing ${cases.length} tool(s) against live model…\n`);
  for (const c of cases) {
    const r = runCase(c);
    const mark = r.ok ? "✅" : "❌";
    console.log(`${mark} ${c.tool.padEnd(13)} ${r.detail}`);
    if (r.ok && r.preview) console.log(`   ↳ ${r.preview.slice(0, 100)}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  process.exit(failed ? 1 : 0);
}

main();

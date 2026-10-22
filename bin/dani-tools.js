#!/usr/bin/env node
/**
 * dani-tools — single entry point dispatcher.
 *
 * Usage:
 *   npx dani-tools <tool> [args...]
 *   dani-tools threadsmith draft.txt --tweets 7
 *
 * Tools: threadsmith, quotemine, replyguy, changelogify, hookline, namelab, faqforge, altmaker
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const TOOLS = ["threadsmith", "quotemine", "replyguy", "changelogify", "hookline", "namelab", "faqforge", "altmaker"];

// Global flags may sit before the tool name: dani-tools --model qwen3.5:2b hookline …
// (after the tool name they pass through to the tool itself). Model choice is
// forwarded via OLLAMA_MODEL so the child's lib/ollama picks it up at load.
const rest = [];
for (let i = 0; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--model") {
    process.env.OLLAMA_MODEL = process.argv[++i] || "";
    continue;
  }
  if (a.startsWith("--model=")) {
    process.env.OLLAMA_MODEL = a.slice("--model=".length);
    continue;
  }
  if (i > 1) rest.push(a);
}

const tool = rest[0];
if (!tool || tool === "--help" || tool === "-h") {
  console.log(`dani-tools — AI CLI toolkit (local Ollama, zero deps)

Usage: dani-tools [--model <name>] <tool> [args...]

Tools:
${TOOLS.map((t) => `  ${t.padEnd(13)} ${tagline(t)}`).join("\n")}

Global options:
  --model <name>   Ollama model for this run (default: qwen3.5:4b or $OLLAMA_MODEL)

Examples:
  dani-tools hookline "my draft post.txt"
  dani-tools changelogify --style hype
  dani-tools --model qwen3.5:2b quotemine notes.txt --count 5
  `);
  process.exit(tool ? 0 : 1);
}

if (!TOOLS.includes(tool)) {
  console.error(`dani-tools: unknown tool '${tool}' — one of: ${TOOLS.join(", ")}`);
  process.exit(1);
}

const cli = path.join(__dirname, "..", "tools", tool, "cli.js");
const res = spawnSync(process.execPath, [cli, ...rest.slice(1)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(res.status ?? 1);

function tagline(t) {
  const first = fs.readFileSync(path.join(__dirname, "..", "tools", t, "cli.js"), "utf8")
    .split("\n").find((l) => l.startsWith(" * " + t));
  return first ? first.replace(/^ \* \S+ — /, "").trim() : "";
}

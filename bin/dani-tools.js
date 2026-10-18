#!/usr/bin/env node
/**
 * dani-tools — single entry point dispatcher.
 *
 * Usage:
 *   npx dani-tools <tool> [args...]
 *   dani-tools threadsmith draft.txt --tweets 7
 *
 * Tools: threadsmith, quotemine, replyguy, changelogify, hookline
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const TOOLS = ["threadsmith", "quotemine", "replyguy", "changelogify", "hookline"];

const tool = process.argv[2];
if (!tool || tool === "--help" || tool === "-h") {
  console.log(`dani-tools — AI CLI toolkit (local Ollama, zero deps)

Usage: dani-tools <tool> [args...]

Tools:
${TOOLS.map((t) => `  ${t.padEnd(13)} ${tagline(t)}`).join("\n")}

Examples:
  dani-tools hookline "my draft post.txt"
  dani-tools changelogify --style hype
  `);
  process.exit(tool ? 0 : 1);
}

if (!TOOLS.includes(tool)) {
  console.error(`dani-tools: unknown tool '${tool}' — one of: ${TOOLS.join(", ")}`);
  process.exit(1);
}

const cli = path.join(__dirname, "..", "tools", tool, "cli.js");
const res = spawnSync(process.execPath, [cli, ...process.argv.slice(3)], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);

function tagline(t) {
  const first = fs.readFileSync(path.join(__dirname, "..", "tools", t, "cli.js"), "utf8")
    .split("\n").find((l) => l.startsWith(" * " + t));
  return first ? first.replace(/^ \* \S+ — /, "").trim() : "";
}

#!/usr/bin/env node
/**
 * quotemine — extract quotable lines from any text, ranked for social.
 *
 * Usage:
 *   node tools/quotemine/cli.js article.txt
 *   cat transcript.txt | node tools/quotemine/cli.js --count 10
 *
 * Options:
 *   --count <n>    number of quotes          (default: 8)
 *   --max <n>      max characters per quote  (default: 240)
 */
const fs = require("fs");
const { chat } = require("../../lib/ollama");
const { globals } = require("../../lib/args");

function parseArgs(argv) {
  const opts = { count: 8, max: 240, file: null };
  const args = globals(argv.slice(2), __filename);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count") opts.count = parseInt(args[++i], 10);
    else if (args[i] === "--max") opts.max = parseInt(args[++i], 10);
    else if (!args[i].startsWith("--")) opts.file = args[i];
  }
  return opts;
}

function readInput(file) {
  if (file) return fs.readFileSync(file, "utf8");
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    console.error("quotemine: provide a file path or pipe text via stdin");
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const input = readInput(opts.file).trim();
  if (!input) {
    console.error("quotemine: empty input");
    process.exit(1);
  }

  const system =
    "You extract the most quotable, shareable lines from text for social media. " +
    "Pick lines that stand alone without context, are surprising or contrarian or beautifully phrased. " +
    "Return them as a plain numbered list, most viral first. No commentary.";
  const user = `Extract ${opts.count} quotes, each under ${opts.max} characters:\n\n${input}`;

  process.stderr.write("quotemine: mining…\n");
  const quotes = await chat(system, user, { temperature: 0.4, numPredict: 1000 });
  process.stdout.write(quotes + "\n");
}

main().catch((e) => {
  console.error("quotemine:", e.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * threadsmith — turn long-form text into a Twitter/X thread.
 *
 * Usage:
 *   node tools/threadsmith/cli.js article.txt
 *   cat article.txt | node tools/threadsmith/cli.js
 *   node tools/threadsmith/cli.js article.txt --tone bold --tweets 8
 *
 * Options:
 *   --tone <t>     casual | professional | bold | funny   (default: casual)
 *   --tweets <n>   target tweet count                       (default: 7)
 *   --no-numbers   don't prefix tweets with 1/, 2/, …
 */
const fs = require("fs");
const { chat } = require("../../lib/ollama");

function parseArgs(argv) {
  const opts = { tone: "casual", tweets: 7, numbers: true, file: null };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tone") opts.tone = args[++i];
    else if (args[i] === "--tweets") opts.tweets = parseInt(args[++i], 10);
    else if (args[i] === "--no-numbers") opts.numbers = false;
    else if (!args[i].startsWith("--")) opts.file = args[i];
  }
  return opts;
}

function readInput(file) {
  if (file) return fs.readFileSync(file, "utf8");
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    console.error("threadsmith: provide a file path or pipe text via stdin");
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const input = readInput(opts.file).trim();
  if (!input) {
    console.error("threadsmith: empty input");
    process.exit(1);
  }

  const system =
    "You convert long-form content into viral Twitter/X threads. " +
    "Each tweet must be under 280 characters including the numbering prefix. " +
    "Hook hard in tweet 1. One idea per tweet. No hashtags unless the source demands it. " +
    "Output the thread and nothing else.";
  const user =
    `Tone: ${opts.tone}\nTarget: ${opts.tweets} tweets\n\n` +
    `Rules:\n- Number each tweet as "1/", "2/", etc.\n` +
    `- Tweet 1 must stop the scroll\n- Last tweet ends with a CTA or punchline\n\n` +
    `Source text:\n${input}`;

  process.stderr.write("threadsmith: thinking…\n");
  const thread = await chat(system, user, { numPredict: 1400 });

  const out = opts.numbers
    ? thread
    : thread.replace(/^\d+\/\s*/gm, "");
  process.stdout.write(out + "\n");
}

main().catch((e) => {
  console.error("threadsmith:", e.message);
  process.exit(1);
});

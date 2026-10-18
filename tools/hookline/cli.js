#!/usr/bin/env node
/**
 * hookline — generate cold-open hooks for posts, videos, and articles.
 *
 * Usage:
 *   node tools/hookline/cli.js "topic or draft text"
 *   node tools/hookline/cli.js draft.txt --count 8
 *   cat notes.md | node tools/hookline/cli.js
 *
 * Options:
 *   --count <n>     hooks to generate            (default: 6)
 *   --kind <k>      video | post | article       (default: post)
 *   --voice <v>     bold | curious | contrarian  (default: bold)
 */
const fs = require("fs");
const { chat } = require("../../lib/ollama");

function parseArgs(argv) {
  const opts = { count: 6, kind: "post", voice: "bold", input: null };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count") opts.count = parseInt(args[++i], 10);
    else if (args[i] === "--kind") opts.kind = args[++i];
    else if (args[i] === "--voice") opts.voice = args[++i];
    else if (!args[i].startsWith("--")) opts.input = args[i];
  }
  return opts;
}

function readInput(file) {
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return fs.readFileSync(file, "utf8");
  }
  if (file) return file; // raw topic passed inline
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    console.error("hookline: provide a topic, file path, or pipe text via stdin");
    process.exit(1);
  }
}

const KIND_HINTS = {
  video: "for a video cold open — spoken in the first 3 seconds, no intro fluff",
  post: "for the first line of a social post — it must stop the scroll",
  article: "for an article lede — it must make skipping feel like losing money",
};

async function main() {
  const opts = parseArgs(process.argv);
  const input = readInput(opts.input).trim();
  if (!input) {
    console.error("hookline: empty input");
    process.exit(1);
  }

  const system =
    "You write hooks — the cold open of a piece of content. " +
    "A great hook is specific, creates an open loop, and never wastes a word. " +
    "No clickbait that the content can't cash. " +
    "Return exactly the requested number of hooks as a plain numbered list, strongest first, " +
    "each on its own line, no commentary, no blank lines.";

  const user =
    `Generate ${opts.count} hooks ${KIND_HINTS[opts.kind] || KIND_HINTS.post}.\n` +
    `Voice: ${opts.voice}.\n\n` +
    (input.length > 400
      ? `Content to hook into:\n${input}`
      : `Topic: ${input}`);

  process.stderr.write("hookline: fishing…\n");
  const out = await chat(system, user, { temperature: 0.9, numPredict: 800 });
  process.stdout.write(out + "\n");
}

main().catch((e) => {
  console.error("hookline:", e.message);
  process.exit(1);
});

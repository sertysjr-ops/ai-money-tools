#!/usr/bin/env node
/**
 * namelab — product & business name generator with domain hints.
 *
 * Usage:
 *   node tools/namelab/cli.js "offline voice assistant"
 *   node tools/namelab/cli.js idea.txt --style premium --count 10
 *   cat pitch.md | node tools/namelab/cli.js --style playful
 *
 * Options:
 *   --count <n>       names to generate              (default: 8)
 *   --style <s>       startup | premium | playful | technical   (default: startup)
 *   --domain <tld>    preferred TLD for hints        (default: .com)
 *   --no-hints        skip domain/availability hints
 */
const fs = require("fs");
const { chat } = require("../../lib/ollama");
const { globals } = require("../../lib/args");

function parseArgs(argv) {
  const opts = { count: 8, style: "startup", domain: ".com", hints: true, input: null };
  const args = globals(argv.slice(2), __filename);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count") opts.count = parseInt(args[++i], 10);
    else if (args[i] === "--style") opts.style = args[++i];
    else if (args[i] === "--domain") opts.domain = args[++i];
    else if (args[i] === "--no-hints") opts.hints = false;
    else if (!args[i].startsWith("--")) opts.input = args[i];
  }
  return opts;
}

function readInput(file) {
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return fs.readFileSync(file, "utf8");
  }
  if (file) return file;
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    console.error("namelab: provide an idea, file path, or pipe text via stdin");
    process.exit(1);
  }
}

const STYLE_HINTS = {
  startup: "punchy two-syllable names that sound like a YC company — invented words welcome, easy to spell, easy to shout across a room",
  premium: "short luxury names — think fashion-house or Swiss-watch minimalism, real words or Latin/Greek roots, .com-first",
  playful: "fun, memorable, slightly irreverent names — alliteration and light wordplay encouraged, meme-adjacent but brand-safe",
  technical: "engineer-credible names — compound technical words, CLI-friendly (lowercase, no spaces), sounds like a devtool",
};

async function main() {
  const opts = parseArgs(process.argv);
  const input = readInput(opts.input).trim();
  if (!input) {
    console.error("namelab: empty input");
    process.exit(1);
  }

  const style = STYLE_HINTS[opts.style] || STYLE_HINTS.startup;
  const hintBlock = opts.hints
    ? `After each name, add an em-dash and a short domain hint: best TLD ` +
      `(${opts.domain} preferred), or note if it's likely taken and suggest ` +
      `an alternative like .io/.app/.dev. Keep the hint under 8 words.`
    : "Output only the names, one per line, no extra commentary.";

  const system =
    "You name products. Great names are short (1-3 syllables), ownable, " +
    "spellable after hearing once, and don't collide with famous brands. " +
    "Return exactly the requested number of names as a plain numbered list, " +
    "strongest first, each on its own line, no blank lines.";

  const user =
    `Generate ${opts.count} names in this style: ${style}.\n` +
    `${hintBlock}\n\n` +
    (input.length > 400
      ? `Product/idea to name:\n${input}`
      : `Idea: ${input}`);

  process.stderr.write("namelab: brewing names…\n");
  const out = await chat(system, user, { temperature: 1.0, numPredict: 900 });
  process.stdout.write(out + "\n");
}

main().catch((e) => {
  console.error("namelab:", e.message);
  process.exit(1);
});

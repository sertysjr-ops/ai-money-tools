#!/usr/bin/env node
/**
 * replyguy — draft replies to any social post, in multiple tones.
 *
 * Usage:
 *   node tools/replyguy/cli.js tweet.txt
 *   pbpaste | node tools/replyguy/cli.js --count 4 --tone witty
 *   node tools/replyguy/cli.js post.txt --agree --count 3
 *
 * Options:
 *   --count <n>     replies to generate              (default: 4)
 *   --tone <t>      witty | supportive | contrarian | expert | casual  (default: mix)
 *   --agree         reply in agreement (default: auto-detect stance)
 *   --disagree      reply pushing back
 *   --short         keep each reply under 120 chars
 *   --context "<s>" extra context about you/your angle
 */
const fs = require("fs");
const { chat } = require("../../lib/ollama");
const { globals } = require("../../lib/args");

function parseArgs(argv) {
  const opts = { count: 4, tone: null, stance: null, short: false, context: null, file: null };
  const args = globals(argv.slice(2), __filename);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count") opts.count = parseInt(args[++i], 10);
    else if (args[i] === "--tone") opts.tone = args[++i];
    else if (args[i] === "--agree") opts.stance = "agree";
    else if (args[i] === "--disagree") opts.stance = "disagree";
    else if (args[i] === "--short") opts.short = true;
    else if (args[i] === "--context") opts.context = args[++i];
    else if (!args[i].startsWith("--")) opts.file = args[i];
  }
  return opts;
}

function readInput(file) {
  if (file) return fs.readFileSync(file, "utf8");
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    console.error("replyguy: provide a file path or pipe the post via stdin");
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const post = readInput(opts.file).trim();
  if (!post) {
    console.error("replyguy: empty input");
    process.exit(1);
  }

  const tones = opts.tone ? [opts.tone] : ["witty", "supportive", "contrarian", "expert"];
  const perTone = Math.max(1, Math.ceil(opts.count / tones.length));

  const system =
    "You write replies to social media posts that get noticed. " +
    "No 'Great post!' filler, no sycophancy, no emoji spam. " +
    "Every reply adds value: a sharp observation, a useful addition, a respectful challenge, " +
    "or a funny angle. Sound like a human, not a brand.";

  const rules = [
    `Post to reply to:\n${post}`,
    "",
    `Generate exactly ${perTone} reply option(s) in a "${tones.join(", ")}" tone.`,
    opts.stance ? `Stance: ${opts.stance} with the post.` : "Pick the most interesting stance per reply (agree, extend, or push back — vary it).",
    opts.short ? "Each reply must be under 120 characters." : "Each reply under 240 characters.",
    opts.context ? `\nContext about me (use to make replies personal):\n${opts.context}` : "",
    "",
    'Format: number each reply, then the tone in parentheses, like:\n1/ (witty) the reply text\n2/ (expert) the reply text',
    "No preamble, no commentary, just the numbered replies.",
  ].join("\n");

  process.stderr.write("replyguy: drafting…\n");
  const replies = await chat(system, rules, { temperature: 0.85, numPredict: 1200 });
  process.stdout.write(replies + "\n");
}

main().catch((e) => {
  console.error("replyguy:", e.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * pitchforge — cold outreach pitches that don't sound cold.
 *
 * Turns what you offer into short, specific outreach messages for
 * potential clients, sponsors, or collaborators. No "I hope this email
 * finds you well" — every pitch leads with something about THEM.
 *
 * Usage:
 *   node tools/pitchforge/cli.js "I build AI chatbots for dentists"
 *   node tools/pitchforge/cli.js offer.txt --target "SaaS founders" --channel email
 *   cat services.md | node tools/pitchforge/cli.js --count 5 --followup
 *
 * Options:
 *   --channel <c>    dm | email                (default: dm)
 *   --target <t>     who you're pitching       (default: potential clients)
 *   --count <n>      pitches to generate       (default: 3)
 *   --followup       add a gentle follow-up nudge under each pitch
 */
const fs = require("fs");
const { chat } = require("../../lib/ollama");
const { globals } = require("../../lib/args");
const { promptFor } = require("../../lib/config");

function parseArgs(argv) {
  const opts = { channel: "dm", target: "potential clients", count: 3, followup: false, input: null };
  const args = globals(argv.slice(2), __filename);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel") opts.channel = args[++i];
    else if (args[i] === "--target") opts.target = args[++i];
    else if (args[i] === "--count") opts.count = parseInt(args[++i], 10);
    else if (args[i] === "--followup") opts.followup = true;
    else if (!args[i].startsWith("--")) opts.input = args[i];
  }
  return opts;
}

function readInput(file) {
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return fs.readFileSync(file, "utf8");
  }
  if (file) return file; // raw offer passed inline
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    console.error("pitchforge: describe what you offer (inline, file, or stdin)");
    process.exit(1);
  }
}

const CHANNEL_HINTS = {
  dm: "a direct message (Twitter/LinkedIn/Instagram) — max 60 words, casual, one clear ask",
  email: "a cold email — subject line prefixed with 'Subject:', under 120 words in the body, one clear ask",
};

async function main() {
  const opts = parseArgs(process.argv);
  const offer = readInput(opts.input).trim();
  if (!offer) {
    console.error("pitchforge: empty offer");
    process.exit(1);
  }

  const system = promptFor("pitchforge",
    "You write cold outreach that gets replies. Rules you never break: " +
    "lead with something specific about the recipient, not the sender; " +
    "one concrete offer, one clear ask; no flattery that could apply to anyone; " +
    "no 'I hope this finds you well', no 'just bumping this'. " +
    "Return exactly the requested number of pitches as a plain numbered list, " +
    "strongest first, no commentary, no headers, no blank-line preamble.");

  const user =
    `Write ${opts.count} cold outreach pitches, each ${CHANNEL_HINTS[opts.channel] || CHANNEL_HINTS.dm}.\n` +
    `Target: ${opts.target}.\n` +
    (opts.followup
      ? "Under each pitch, add one line starting with 'Follow-up:' — a gentle 3-day-later nudge.\n"
      : "") +
    `\nWhat is being offered:\n${offer}`;

  process.stderr.write("pitchforge: sharpening…\n");
  const out = await chat(system, user, { temperature: 0.8, numPredict: 900 });
  process.stdout.write(out + "\n");
}

main().catch((e) => {
  console.error("pitchforge:", e.message);
  process.exit(1);
});

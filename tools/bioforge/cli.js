#!/usr/bin/env node
/**
 * bioforge — social bios that earn the follow.
 *
 * Turns "who you are and what you do" into platform-native bios with
 * real character budgets. Every line is annotated with its actual
 * length so you can see what fits before you paste it.
 *
 * Usage:
 *   node tools/bioforge/cli.js "indie hacker building offline AI tools"
 *   node tools/bioforge/cli.js about.txt --platform linkedin --vibe professional
 *   cat resume.md | node tools/bioforge/cli.js --count 8 --vibe minimal
 *
 * Options:
 *   --platform <p>   x | linkedin | instagram | github       (default: x)
 *   --vibe <v>       professional | witty | bold | minimal   (default: witty)
 *   --count <n>      bios to generate                        (default: 5)
 */
const fs = require("fs");
const { chat } = require("../../lib/ollama");
const { globals } = require("../../lib/args");
const { promptFor } = require("../../lib/config");

function parseArgs(argv) {
  const opts = { platform: "x", vibe: "witty", count: 5, input: null };
  const args = globals(argv.slice(2), __filename);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--platform") opts.platform = args[++i];
    else if (args[i] === "--vibe") opts.vibe = args[++i];
    else if (args[i] === "--count") opts.count = parseInt(args[++i], 10);
    else if (!args[i].startsWith("--")) opts.input = args[i];
  }
  return opts;
}

function readInput(file) {
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return fs.readFileSync(file, "utf8");
  }
  if (file) return file; // raw description passed inline
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    console.error("bioforge: describe who you are (inline, file, or stdin)");
    process.exit(1);
  }
}

const PLATFORMS = {
  x: { limit: 160, hint: "an X (Twitter) bio — personality + proof, no hashtag spam, no 'views my own'" },
  linkedin: { limit: 220, hint: "a LinkedIn headline — who you help + how, credible, no buzzword soup" },
  instagram: { limit: 150, hint: "an Instagram bio — short punchy fragments, at most one emoji" },
  github: { limit: 160, hint: "a GitHub profile bio — builder-first, plain words, what you ship" },
};

const VIBE_HINTS = {
  professional: "credible and direct — the bio a recruiter screenshots",
  witty: "clever without trying too hard — one smirk, zero cringe",
  bold: "confident to the edge of arrogant — big claims with receipts implied",
  minimal: "as few words as possible — every syllable earns its place",
};

async function main() {
  const opts = parseArgs(process.argv);
  const input = readInput(opts.input).trim();
  if (!input) {
    console.error("bioforge: empty input");
    process.exit(1);
  }

  const platform = PLATFORMS[opts.platform] || PLATFORMS.x;
  const vibe = VIBE_HINTS[opts.vibe] || VIBE_HINTS.witty;

  const system = promptFor("bioforge",
    "You write social bios that earn the follow. A great bio is specific " +
    "(what you do + for whom + proof), never a list of job titles, never " +
    "'passionate about', never 'thought leader'. Respect the character " +
    "budget absolutely — a bio that doesn't fit is worthless. " +
    "Return exactly the requested number of bios as a plain numbered list, " +
    "strongest first, one bio per line, no commentary, no quotes, no labels.");

  const user =
    `Generate ${opts.count} options for ${platform.hint}.\n` +
    `Hard limit: ${platform.limit} characters each (count carefully).\n` +
    `Vibe: ${vibe}.\n\n` +
    `Who this is for:\n${input}`;

  process.stderr.write("bioforge: forging…\n");
  const out = await chat(system, user, { temperature: 0.9, numPredict: 700 });

  // annotate real lengths — the model aims for the budget, we verify it
  const lines = out.split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    process.stdout.write(out + "\n"); // format drift: pass raw through
    return;
  }
  for (const bio of lines.slice(0, Math.max(opts.count, lines.length))) {
    const n = [...bio].length;
    const over = n > platform.limit ? "  ⚠ OVER" : "";
    console.log(`${bio}  [${n}/${platform.limit}]${over}`);
  }
}

main().catch((e) => {
  console.error("bioforge:", e.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * altmaker — A/B viral angle generator: same idea, N different framings.
 *
 * Takes a draft post or raw topic and mints alternate versions, each with
 * an angle label, the rewritten hook, and a one-line why-it-works note —
 * so you can pick the framing with the best shot instead of shipping the
 * first one you wrote.
 *
 * Usage:
 *   node tools/altmaker/cli.js "your draft or topic"
 *   node tools/altmaker/cli.js draft.txt --count 6 --kind contrarian
 *   cat notes.md | node tools/altmaker/cli.js --json
 *
 * Options:
 *   --count <n>        angles to generate              (default: 4)
 *   --kind <k>         contrarian | curiosity | data | story | bold | all
 *                                                      (default: all)
 *   --platform <p>     twitter | linkedin | blog      (default: twitter)
 *   --json             machine-readable output (array of {angle, hook, why})
 */
const fs = require("fs");
const { chat } = require("../../lib/ollama");

function parseArgs(argv) {
  const opts = { count: 4, kind: "all", platform: "twitter", json: false, input: null };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count") opts.count = parseInt(args[++i], 10);
    else if (args[i] === "--kind") opts.kind = args[++i];
    else if (args[i] === "--platform") opts.platform = args[++i];
    else if (args[i] === "--json") opts.json = true;
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
    console.error("altmaker: provide a topic, file path, or pipe text via stdin");
    process.exit(1);
  }
}

const KIND_HINTS = {
  contrarian: "challenge the mainstream take on this — respectfully attack the default view",
  curiosity: "open a loop the reader can only close by reading — withhold the payoff",
  data: "lead with a specific number, stat, or measurable claim — precision builds trust",
  story: "enter through a personal moment — a specific scene, not a summary",
  bold: "make the strongest defensible claim — confidence is the hook",
  all: "pick the N most diverse, highest-virality-potential angles — no two alike",
};

const PLATFORM_HINTS = {
  twitter: "each hook max 240 chars — it must stop the scroll cold",
  linkedin: "professional but personal, 1-2 lines each — earns the 'see more' click",
  blog: "article headline + lede sentence pair — must make skipping feel costly",
};

/**
 * Tolerant parser for the model's numbered list. Expected item shape:
 *   [angle-type] hook text — why it works
 * Survives missing brackets, missing why-part, and stray markdown.
 */
function parseAngles(text) {
  const items = [];
  const lines = text.split("\n");
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)[.)\]]\s+(.*)$/);
    if (m) {
      if (cur) items.push(cur);
      cur = { angle: "", hook: m[2], why: "" };
      continue;
    }
    if (!cur) continue; // preamble/noise before item 1
    // continuation line: append to hook, or to why if we already split it
    if (cur.why) cur.why += " " + line;
    else cur.hook += " " + line;
  }
  if (cur) items.push(cur);

  return items
    .map((it) => {
      let rest = it.hook;
      // Brackets are an explicit signal — trust them even for invented labels
      // ("[Urgency trap]"), because with --kind all the model names its own
      // angles. The whitelist only gates unbracketed "Word:" prefixes so we
      // don't eat the first word of a hook that happens to start boldly.
      const bracket = rest.match(/^\[([^\]]{2,30})\]\s*/);
      const bare = rest.match(/^([A-Za-z][a-z -]{2,20})\s*[:\-–]\s*/);
      if (bracket) {
        it.angle = bracket[1].trim();
        rest = rest.slice(bracket[0].length);
      } else if (
        bare &&
        /contrarian|curiosity|data|story|bold|myth|hot take|question|challenge|urgency|relatability|roi|secret/i.test(bare[1])
      ) {
        it.angle = bare[1].trim();
        rest = rest.slice(bare[0].length);
      }
      const whySplit = rest.match(/^(.*?)\s+[—–-]\s*(.+)$/);
      if (whySplit) {
        it.hook = whySplit[1].trim();
        it.why = (whySplit[2] + (it.why ? " " + it.why : "")).trim();
      } else {
        // model drift: "…? Why this framing works: …" / "Why: …" inline instead
        const inlineWhy = rest.match(
          /^(.*?)[.?!]?\s+why (?:this (?:framing|angle|works)|it) (?:works|lands)?\s*[:\-–]?\s*(.+)$/i
        );
        if (inlineWhy) {
          it.hook = inlineWhy[1].trim();
          it.why = (inlineWhy[2] + (it.why ? " " + it.why : "")).trim();
        } else {
          it.hook = rest.trim();
        }
      }
      it.hook = it.hook.replace(/^["“]+|["”]+$/g, "").trim();
      return it;
    })
    .filter((it) => it.hook.length > 0);
}

async function main() {
  const opts = parseArgs(process.argv);
  const input = readInput(opts.input).trim();
  if (!input) {
    console.error("altmaker: empty input");
    process.exit(1);
  }
  const n = Math.min(10, Math.max(1, opts.count || 4));

  const system =
    "You are a viral-content strategist. You take one idea and reframe it " +
    "into multiple distinct angles, each labeled with its angle type in " +
    "[brackets], followed by the rewritten hook, an em-dash, and a one-line " +
    "why-it-works note. Angles must differ in framing, not just wording. " +
    `Return exactly ${n} items as a numbered list, no preamble, no blank lines.`;

  const user =
    `Source material:\n${input}\n\n` +
    `Give me ${n} alternate angles. Angle direction: ${KIND_HINTS[opts.kind] || KIND_HINTS.all}. ` +
    `Target: ${PLATFORM_HINTS[opts.platform] || PLATFORM_HINTS.twitter}. ` +
    `Format per item: [angle-type] the rewritten hook — why this framing works`;

  process.stderr.write(`altmaker: angling… (${n} × ${opts.kind} / ${opts.platform})\n`);
  const out = await chat(system, user, { temperature: 0.95, numPredict: 1000 });
  const angles = parseAngles(out);

  if (opts.json) {
    process.stdout.write(JSON.stringify(angles, null, 2) + "\n");
    return;
  }
  if (angles.length === 0) {
    // parser gave up — raw output beats no output
    process.stdout.write(out + "\n");
    return;
  }
  angles.forEach((a, i) => {
    const tag = a.angle ? `[${a.angle}] ` : "";
    process.stdout.write(`${i + 1}. ${tag}${a.hook}\n`);
    if (a.why) process.stdout.write(`   why: ${a.why}\n`);
  });
}

main().catch((e) => {
  console.error("altmaker:", e.message);
  process.exit(1);
});

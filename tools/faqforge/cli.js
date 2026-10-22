#!/usr/bin/env node
/**
 * faqforge — turn docs, READMEs, or raw notes into a polished FAQ page.
 *
 * Usage:
 *   node tools/faqforge/cli.js README.md --out faq.html
 *   node tools/faqforge/cli.js "how subscriptions work" --count 6
 *   cat guide.md | node tools/faqforge/cli.js --style support
 *
 * Options:
 *   --count <n>      Q&A pairs to generate        (default: 8)
 *   --style <s>      docs | landing | support     (default: docs)
 *   --title <t>      page title                   (default: "Frequently asked questions")
 *   --out <file>     write the HTML page there    (default: stdout)
 */
const fs = require("fs");
const path = require("path");
const { chat } = require("../../lib/ollama");
const { globals } = require("../../lib/args");

function parseArgs(argv) {
  const opts = {
    count: 8,
    style: "docs",
    title: null,
    out: null,
    input: null,
  };
  const args = globals(argv.slice(2), __filename);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count") opts.count = parseInt(args[++i], 10);
    else if (args[i] === "--style") opts.style = args[++i];
    else if (args[i] === "--title") opts.title = args[++i];
    else if (args[i] === "--out") opts.out = args[++i];
    else if (!args[i].startsWith("--")) opts.input = args[i];
  }
  return opts;
}

function readInput(file) {
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return { text: fs.readFileSync(file, "utf8"), source: path.basename(file) };
  }
  if (file) return { text: file, source: "inline topic" };
  try {
    return { text: fs.readFileSync(0, "utf8"), source: "stdin" };
  } catch {
    console.error("faqforge: provide a file, a topic, or pipe text via stdin");
    process.exit(1);
  }
}

const STYLE_HINTS = {
  docs: "for a product docs site — precise, covers setup/usage/edge cases, assumes reader has the product open",
  landing: "for a marketing landing page — pre-empts buying objections, highlights value, short punchy answers",
  support: "for a support/help center — troubleshooting oriented, empathetic, step-by-step fixes",
};

function parseQA(raw) {
  // Preferred contract: "Q: ...\nA: ..." blocks. Some models drop the A:
  // label, so split on Q: markers and treat everything up to the next Q:
  // as the answer, stripping an A: prefix when present.
  const pairs = [];
  const segments = raw.split(/^Q:\s*/m).slice(1); // drop preamble before first Q:
  for (const seg of segments) {
    const nl = seg.indexOf("\n");
    if (nl === -1) {
      // single-line "Q: ... A: ..." fallback
      const inline = seg.match(/^(.+?)\s+A:\s*(.+)$/s);
      if (inline) {
        pairs.push({
          q: inline[1].trim().replace(/^["']|["']$/g, ""),
          a: inline[2].trim(),
        });
      }
      continue;
    }
    const q = seg.slice(0, nl).trim().replace(/^["']|["']$/g, "");
    let a = seg.slice(nl + 1).trim();
    const label = a.match(/^A:\s*/);
    if (label) a = a.slice(label[0].length).trim();
    // cut any trailing commentary the model tacked on after the answer
    a = a.split(/\n(?=Q:|#{1,3}\s)/)[0].trim();
    if (q && a && q.length >= 5) pairs.push({ q, a });
  }
  return pairs;
}

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(title, pairs, style, source) {
  const accent =
    style === "landing" ? "#f43f5e" : style === "support" ? "#0ea5e9" : "#7c5cff";
  const items = pairs
    .map(
      (p, i) => `      <details${i === 0 ? " open" : ""}>
        <summary>${esc(p.q)}</summary>
        <p>${esc(p.a).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>
      </details>`
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0b0d12; color: #e8ecf4;
    font: 16px/1.6 -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    min-height: 100vh; padding: 48px 20px; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 28px; margin-bottom: 8px; }
  .sub { color: #8a93a8; font-size: 14px; margin-bottom: 32px; }
  details { background: #12151d; border: 1px solid #232838; border-radius: 12px;
    margin-bottom: 12px; overflow: hidden; }
  details[open] { border-color: var(--accent); }
  summary { cursor: pointer; padding: 16px 20px; font-weight: 600;
    list-style: none; position: relative; padding-right: 44px; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: "+"; position: absolute; right: 18px; top: 50%;
    transform: translateY(-50%); color: var(--accent); font-size: 20px;
    font-weight: 400; transition: transform .15s; }
  details[open] summary::after { transform: translateY(-50%) rotate(45deg); }
  details p { padding: 0 20px 16px; color: #b7bfd1; }
  footer { margin-top: 32px; color: #5a6377; font-size: 12px; }
</style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p class="sub">${pairs.length} questions · generated by faqforge from ${esc(source)}</p>
${items}
  <footer>Self-contained page — no JS, no trackers. Edit freely.</footer>
</main>
</body>
</html>
`;
}

async function main() {
  const opts = parseArgs(process.argv);
  const { text, source } = readInput(opts.input);
  if (!text.trim()) {
    console.error("faqforge: empty input");
    process.exit(1);
  }

  const title = opts.title || "Frequently asked questions";
  const system =
    "You write FAQ pages. Given source material, you anticipate the exact " +
    "questions a real user would ask and answer them clearly and completely. " +
    "Answers are 2-4 sentences, plain prose, no markdown formatting. " +
    "Return exactly the requested number of Q&A pairs in EXACTLY this format " +
    "(no preamble, no commentary):\n\n" +
    "Q: <question>\nA: <answer>\n\nQ: <question>\nA: <answer>";

  const user =
    `Write ${opts.count} FAQ pairs ${STYLE_HINTS[opts.style] || STYLE_HINTS.docs}.` +
    (opts.style === "landing" ? "\nOrder them from most common objection to most technical." : "") +
    (opts.style === "support" ? "\nOrder them from most frequent problem to most obscure." : "") +
    `\n\nPage title: ${title}\n\n` +
    (text.length > 300
      ? `Source material (${source}, ${text.length} chars):\n${text}`
      : `Topic: ${text}`);

  process.stderr.write(`faqforge: forging ${opts.count} Q&A pairs from ${source}…\n`);
  const raw = await chat(system, user, { temperature: 0.6, numPredict: 2200 });

  const pairs = parseQA(raw);
  if (pairs.length === 0) {
    console.error("faqforge: model did not return Q&A pairs in the expected format");
    console.error("raw output:\n" + raw.slice(0, 500));
    process.exit(1);
  }

  const html = buildHtml(title, pairs, opts.style, source);
  if (opts.out) {
    fs.writeFileSync(opts.out, html);
    console.log(`faqforge: wrote ${opts.out} (${pairs.length} Q&A pairs, ${html.length} bytes)`);
  } else {
    process.stdout.write(html);
  }
}

main().catch((e) => {
  console.error("faqforge:", e.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * changelogify — turn git history into user-facing release notes.
 *
 * Usage:
 *   node tools/changelogify/cli.js                 # since last tag → CHANGELOG entry
 *   node tools/changelogify/cli.js v1.2.0..HEAD    # explicit range
 *   node tools/changelogify/cli.js --version 2.0.0 # label the release
 *   node tools/changelogify/cli.js --raw           # just the grouped commits
 *
 * Options:
 *   --version <v>   release label              (default: auto-detect next tag)
 *   --style <s>     concise | detailed | hype  (default: detailed)
 *   --raw           print grouped commits, skip AI pass
 *   --out <file>    write to file instead of stdout
 */
const { execSync } = require("child_process");
const fs = require("fs");
const { chat } = require("../../lib/ollama");
const { globals } = require("../../lib/args");

function parseArgs(argv) {
  const opts = { range: null, version: null, style: "detailed", raw: false, out: null };
  const args = globals(argv.slice(2), __filename);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version") opts.version = args[++i];
    else if (args[i] === "--style") opts.style = args[++i];
    else if (args[i] === "--raw") opts.raw = true;
    else if (args[i] === "--out") opts.out = args[++i];
    else if (!args[i].startsWith("--")) opts.range = args[i];
  }
  return opts;
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

function detectRange() {
  const lastTag = git("describe --tags --abbrev=0 2>/dev/null");
  return lastTag ? `${lastTag}..HEAD` : "-n 50";
}

function detectNextVersion() {
  const lastTag = git("describe --tags --abbrev=0 2>/dev/null") || "v0.0.0";
  const m = lastTag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return "Unreleased";
  return `v${m[1]}.${parseInt(m[2], 10) + 1}.0`;
}

function collectCommits(range) {
  const fmt = "%H|%an|%s|%b";
  const raw = range.startsWith("-n")
    ? git(`log ${range} --format='${fmt}' --no-merges`)
    : git(`log ${range} --format='${fmt}' --no-merges`);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => {
      const [hash, author, subject, ...body] = line.split("|");
      return { hash: hash.slice(0, 7), author, subject, body: body.join("|").trim() };
    })
    .filter((c) => c.subject);
}

function groupCommits(commits) {
  const groups = { Features: [], Fixes: [], Chores: [], Other: [] };
  for (const c of commits) {
    const s = c.subject.toLowerCase();
    if (/^(feat|feature)/.test(s) || s.includes("add ")) groups.Features.push(c);
    else if (/^(fix|bug|hotfix|patch)/.test(s)) groups.Fixes.push(c);
    else if (/^(chore|refactor|deps|bump|ci|test|docs)/.test(s)) groups.Chores.push(c);
    else groups.Other.push(c);
  }
  return groups;
}

function rawMarkdown(version, groups) {
  let out = `## ${version}\n\n`;
  for (const [name, items] of Object.entries(groups)) {
    if (!items.length) continue;
    out += `### ${name}\n\n`;
    for (const c of items) out += `- ${c.subject} (${c.hash})\n`;
    out += "\n";
  }
  return out;
}

async function aiNotes(version, groups, style) {
  const summary = rawMarkdown(version, groups);
  const styleHint = {
    concise: "Keep it terse: one line per change, no fluff.",
    detailed: "Explain what changed and why it matters to users.",
    hype: "Write like a launch post — energetic, benefit-first, emoji welcome.",
  }[style] || "Explain what changed and why it matters to users.";

  const system =
    "You write release notes for software products. " +
    "Turn raw commit lists into user-facing notes. " +
    "Skip internal refactors unless user-visible. Never invent features not in the commits. " +
    styleHint;

  return chat(system, `Release ${version}\n\nCommits:\n${summary}`, {
    temperature: 0.4,
    numPredict: 1200,
  });
}

async function main() {
  const opts = parseArgs(process.argv);
  const range = opts.range || detectRange();
  const version = opts.version || detectNextVersion();

  const commits = collectCommits(range);
  if (!commits.length) {
    console.error(`changelogify: no commits found in range '${range}'`);
    process.exit(1);
  }

  console.error(`changelogify: ${commits.length} commits in ${range}`);
  const groups = groupCommits(commits);

  const md = opts.raw
    ? rawMarkdown(version, groups)
    : `# ${version}\n\n${await aiNotes(version, groups, opts.style)}\n\n<details><summary>Raw commits</summary>\n\n${rawMarkdown(version, groups)}</details>\n`;

  if (opts.out) {
    fs.writeFileSync(opts.out, md);
    console.error(`changelogify: wrote ${opts.out}`);
  } else {
    console.log(md);
  }
}

main().catch((e) => {
  console.error(`changelogify: ${e.message}`);
  process.exit(1);
});

# AI Money-Making Tools

A collection of small, shippable AI tools. Zero dependencies — each tool runs on
plain Node.js 18+ and a local [Ollama](https://ollama.com) model. No API keys,
no cloud bills, works offline.

## Tools

### 🧵 threadsmith

Turn long-form text into a ready-to-post Twitter/X thread.

```bash
node tools/threadsmith/cli.js article.txt --tone bold --tweets 8
cat transcript.txt | node tools/threadsmith/cli.js
```

### ⛏️ quotemine

Extract the most quotable lines from any text, ranked for social.

```bash
node tools/quotemine/cli.js essay.txt --count 10
cat book-chapter.txt | node tools/quotemine/cli.js
```

### 💬 replyguy

Draft replies to any social post — multiple tones, optional stance.

```bash
node tools/replyguy/cli.js tweet.txt --count 4
pbpaste | node tools/replyguy/cli.js --tone witty --agree
node tools/replyguy/cli.js post.txt --context "I'm a devtools founder"
```

### 📋 changelogify

Turn git history into user-facing release notes.

```bash
node tools/changelogify/cli.js                # since last tag (or last 50 commits)
node tools/changelogify/cli.js v1.2.0..HEAD --style hype
node tools/changelogify/cli.js --out CHANGELOG.md
```

### 🪝 hookline

Generate cold-open hooks for posts, videos, and articles — scroll-stopping first lines.

```bash
node tools/hookline/cli.js "why most side projects fail" --count 5
node tools/hookline/cli.js draft.txt --kind video --voice contrarian
cat notes.md | node tools/hookline/cli.js --kind article
```

### 🏷️ namelab

Product & business name generator with domain hints.

```bash
node tools/namelab/cli.js "offline AI voice assistant for developers"
node tools/namelab/cli.js pitch.md --style premium --count 10
node tools/namelab/cli.js "budget tracker" --style playful --domain .app
```

### ❓ faqforge

Turn docs, READMEs, or notes into a polished self-contained FAQ page (dark
theme, zero-JS accordions — drop it straight into any site).

```bash
node tools/faqforge/cli.js README.md --out faq.html
node tools/faqforge/cli.js "how subscriptions work" --count 6 --style landing
cat guide.md | node tools/faqforge/cli.js --style support --title "Help Center"
```

### 🧪 altmaker

A/B viral angle generator — same idea, N different framings. Each angle
comes labeled with its type, the rewritten hook, and a why-it-works note,
so you ship the framing with the best shot, not the first one you wrote.

```bash
node tools/altmaker/cli.js "your draft or topic" --count 5
node tools/altmaker/cli.js draft.txt --kind contrarian --platform linkedin
cat notes.md | node tools/altmaker/cli.js --json   # pipe into other tools
```

## Install

Any of these work:

```bash
# run straight from the repo (zero install)
node bin/dani-tools.js hookline "your topic"

# via npm from GitHub
npx github:sertysjr-ops/ai-money-tools hookline "your topic"

# or link it globally
npm link
dani-tools threadsmith article.txt --tweets 7
changelogify --style hype
```

## Setup

```bash
ollama pull qwen3.5:4b   # any model works; override with OLLAMA_MODEL env var
```

Optional env vars:

| Var | Default | What it does |
|-----|---------|--------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `qwen3.5:4b` | Model to use |

## Tests

```bash
npm test                      # smoke-test all 7 tools against live Ollama
node test/run-all.js namelab  # …or just the ones you touched
```

Wiring gate, not a quality gate: every tool gets a tiny canned input and must
exit 0 with non-trivial output. Catches broken requires, dead Ollama, bad
flags, empty model output.

## Philosophy

- **Build in a day, ship in a weekend** — every tool is <100 lines
- **Zero deps** — if Node can do it natively, no npm package
- **Local first** — your text never leaves the machine
- **Composable** — pipe input in, pipe output out

## Ideas backlog

- [x] `replyguy` — generate reply variants to any post (engagement farming)
- [x] `changelogify` — turn git diffs into user-facing release notes
- [x] `hookline` — cold-open hook generator for posts/videos/articles
- [x] `namelab` — product name generator with domain-check hints
- [x] `faqforge` — turn docs/support text into an FAQ page
- [x] `altmaker` — A/B viral angles: same idea, N framings with why-it-works
- [ ] Chrome extension wrapper for threadsmith (select text → thread)

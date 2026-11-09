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

### 🤝 pitchforge

Cold outreach pitches that don't sound cold — DMs or emails that lead
with something specific about the recipient, one offer, one clear ask.
For freelancers, agencies, and indie hackers selling services.

```bash
node tools/pitchforge/cli.js "I build AI chatbots for dentists"
node tools/pitchforge/cli.js offer.txt --target "SaaS founders" --channel email
cat services.md | node tools/pitchforge/cli.js --count 5 --followup
```

## Local HTTP API (`serve.js`)

Wraps every text-in/text-out tool as a tiny JSON API — same CLIs under the
hood (spawned per request, stdin → stdout), so the CLI stays the single
source of truth. Built for the Chrome extension, n8n/Make webhooks, or any
local automation.

```bash
node serve.js        # → http://127.0.0.1:7890  (or DANI_TOOLS_PORT=8000)
```

```
GET  /           → the playground: try every tool in the browser
                   (tool picker, per-tool flag forms, copy button)
GET  /api/health → { ok, model, tools }
GET  /api/tools  → { ok, tools: [{ name, tagline, flags: [{flag,kind}] }] }
                   UIs use this to render real forms per tool
POST /api/run    → { tool, input, flags? } → { ok, tool, output, tookMs }
                   flags: CLI flags without dashes, per-tool whitelist,
                   e.g. { "tone": "bold", "tweets": 8 }
POST /api/batch  → { jobs: [{ tool, input, flags? }, ...] } (max 10)
                 → { ok, results: [{ ok, tool, output|error, tookMs }], tookMs }
                   sequential, per-job isolated — the n8n/Make shape
```

CORS is open (`*`) so `chrome-extension://` origins can call it; the server
binds to localhost only. `changelogify` is CLI-only (it reads a git repo,
not stdin text).

## Chrome extension (Threadsmith)

`extension/` is a Manifest V3 extension: select any text on any page →
right-click → "Threadsmith: turn into X thread" → a results tab opens with
numbered tweet cards, per-tweet character counts (280+ flagged red), and a
copy-all button. An options page (chrome://extensions → Threadsmith →
Extension options) sets the default tone (casual/professional/bold/funny)
and thread length (3–10 tweets), synced via `chrome.storage.sync`.

```bash
node serve.js   # must be running — the extension calls the local API
```

Then chrome://extensions → Developer mode → Load unpacked → pick
`extension/`. Everything runs locally: page text goes to 127.0.0.1, never
to a cloud.

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

## Config file (creator-CLI tier)

One optional JSON file tunes every tool — your default model, your favorite
flags per tool, and full system-prompt overrides for a personal voice:

```jsonc
{
  "model": "qwen3.5:4b",
  "defaults": {
    "threadsmith": { "tone": "bold", "tweets": 8 },
    "hookline":    { "count": 10 }
  },
  "prompts": {
    "threadsmith": { "system": "You write threads like a sharp indie hacker…" }
  }
}
```

Search order: `$DANI_TOOLS_CONFIG` → `./dani-tools.config.json` →
`~/.config/dani-tools/config.json`. Explicit CLI flags always beat config
defaults; a prompt override replaces the tool's whole system prompt (keep
the output-format rules in it). See `dani-tools.config.example.json`, and
inspect what any tool resolved with:

```bash
threadsmith --print-config
```

### Prompt library (5 persona packs)

`prompt-library/` ships ready-made configs that re-voice **all 9 tools**
with one coherent persona — 40 hand-written prompts, parser-safe:

| Pack | Voice |
|---|---|
| `viral-creator` | X growth — bold claims, open loops, pattern interrupts |
| `indie-hacker` | build-in-public — first person, real numbers, zero buzzwords |
| `agency-pro` | client-safe polish — benefit-led, brand-ready |
| `technical-founder` | dev audience — precise, no fluff, benchmarks over adjectives |
| `ghostwriter-li` | LinkedIn thought leadership — story loops, earned insights |

```bash
DANI_TOOLS_CONFIG=prompt-library/viral-creator.config.json \
  dani-tools threadsmith article.txt
```

See `prompt-library/README.md` for per-pack details and mixing rules.

## Global flags

Every tool accepts:

```
--model <name>   Ollama model for this run (default: qwen3.5:4b or $OLLAMA_MODEL)
-h, --help       man-style help — prints the tool's Usage + options
```

`--model` works both before the tool name (dispatcher forwards it) and
after it:

```bash
dani-tools --model qwen3.5:2b quotemine notes.txt --count 5
quotemine notes.txt --count 5 --model qwen3.5:9b
```

## Shell completions

A zsh completion script lives at `completions/_dani-tools` — tool names,
per-tool flags, file completion:

```bash
mkdir -p ~/.zfunc && cp completions/_dani-tools ~/.zfunc/
# then in ~/.zshrc:  fpath+=("$HOME/.zfunc"); autoload -U compinit && compinit
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
npm test                      # smoke-test all tools + the HTTP API + the pack zip
node test/run-all.js namelab  # …or just the tools you touched
node test/serve.test.js       # …or just the API + extension wiring
node test/pack.test.js        # …or just the shippable artifact
```

## Packaging (sellable zip)

```bash
npm run pack    # → dist/dani-tools-<version>.zip
```

Stages exactly what a customer needs (9 CLIs, dispatcher, libs, automation
server, 5 persona packs, config example, completions, LICENSE, INSTALL.md,
LISTING.md) and zips it. `marketing/LISTING.md` is the paste-ready Gumroad product page.
`test/pack.test.js` verifies every bin target ships and no source-only
dirs leak into the artifact.

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
- [x] `pitchforge` — cold outreach pitches (DM/email) that lead with them, not you
- [x] Chrome extension wrapper for threadsmith (select text → thread)
- [x] `serve.js` — local HTTP API wrapping the tools (n8n/Make/webhook-ready)

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

## Setup

```bash
ollama pull qwen3.5:4b   # any model works; override with OLLAMA_MODEL env var
```

Optional env vars:

| Var | Default | What it does |
|-----|---------|--------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `qwen3.5:4b` | Model to use |

## Philosophy

- **Build in a day, ship in a weekend** — every tool is <100 lines
- **Zero deps** — if Node can do it natively, no npm package
- **Local first** — your text never leaves the machine
- **Composable** — pipe input in, pipe output out

## Ideas backlog

- [ ] `replyguy` — generate 5 reply variants to any post (engagement farming)
- [ ] `namelab` — product name generator with domain-check hints
- [ ] `changelogify` — turn git diffs into user-facing release notes
- [ ] `faqforge` — turn docs/support text into an FAQ page
- [ ] Chrome extension wrapper for threadsmith (select text → thread)

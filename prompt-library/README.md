# Prompt Library — 5 persona packs for dani-tools

Each pack is a complete `dani-tools.config.json` that re-voices **all 8 tools**
with one coherent persona. No code changes needed — point
`DANI_TOOLS_CONFIG` at a pack and every tool speaks that voice.

## The packs

| Pack | Voice | Best for |
|---|---|---|
| `viral-creator.config.json` | Scroll-stopping X growth energy — bold claims, open loops, pattern interrupts | Personal brand on Twitter/X |
| `indie-hacker.config.json` | Build-in-public honesty — first person, real numbers, zero buzzwords | Bootstrapped founders |
| `agency-pro.config.json` | Polished client-facing copy — benefit-led, brand-safe, deadline-ready | Client work & brand accounts |
| `technical-founder.config.json` | Dev-audience precision — correct terms, no fluff, benchmarks over adjectives | Dev tools & eng blogs |
| `ghostwriter-li.config.json` | LinkedIn thought leadership — story loops, earned insights, professional warmth | Exec ghostwriting |

Every pack also ships sensible flag defaults (e.g. viral-creator defaults
threadsmith to `--tone bold --tweets 8`), so the flags you type always win
but the ones you skip land on the persona's sweet spot.

## Usage

```bash
# one-shot: single command in a persona's voice
DANI_TOOLS_CONFIG=prompt-library/viral-creator.config.json \
  dani-tools threadsmith blog-post.md

# per-project: copy a pack into the project as its config
cp prompt-library/indie-hacker.config.json ~/projects/my-saas/dani-tools.config.json
cd ~/projects/my-saas && dani-tools hookline launch-notes.md

# global: make one persona your default everywhere
mkdir -p ~/.config/dani-tools
cp prompt-library/agency-pro.config.json ~/.config/dani-tools/config.json
```

## Mixing & editing

Packs are plain JSON — steal lines across personas freely. The only rule:
**prompt overrides replace the tool's ENTIRE system prompt**, so keep the
output-format instructions intact (the parsers depend on them):

- `threadsmith` → numbered tweets, **<280 chars** including prefix
- `quotemine`, `hookline`, `namelab` → **plain numbered list**, no commentary
- `faqforge` → exact `Q:` / `A:` pairs
- `altmaker` → `[angle] hook — why-it-works` lines
- `changelogify` → never invent features not in the commits

Verify your edit landed without burning a model call:

```bash
DANI_TOOLS_CONFIG=your-edit.json dani-tools --print-config
```

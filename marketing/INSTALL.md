# dani-tools — Install

**Requirements:** Node.js 18+ and [Ollama](https://ollama.com) running locally
with one model pulled (default `qwen3.5:4b` — any model works).

```bash
ollama pull qwen3.5:4b
```

## Install (30 seconds)

```bash
# from the unzipped folder
npm link            # puts all 8 tools + the dani-tools dispatcher on your PATH

threadsmith article.txt --tone bold
quotemine essay.txt --count 10
dani-tools          # lists every tool
```

Don't want npm link? Run them directly — zero dependencies, plain Node:

```bash
node tools/threadsmith/cli.js article.txt
```

## Make it yours (the creator tier)

Drop a `dani-tools.config.json` next to where you run the tools (or point
`DANI_TOOLS_CONFIG` at it):

```json
{
  "model": "qwen3.5:4b",
  "tools": {
    "threadsmith": { "flags": { "tone": "bold", "tweets": 8 } },
    "quotemine":   { "prompt": "Extract lines MY audience would screenshot..." }
  }
}
```

- `model` — default Ollama model for every tool
- per-tool `flags` — your defaults, always applied (your CLI flags still win)
- per-tool `prompt` — **full system-prompt override**. This is the whole
  point of the tier: the tools become YOUR voice, not generic AI output.

Start from the included `dani-tools.config.example.json`. Introspect the
resolved config any time with `--print-config` (works offline).

## Automation (optional)

```bash
npm run serve       # JSON API on 127.0.0.1:7890 — n8n/Make/Zapier webhook-ready
curl -X POST localhost:7890/api/run \
  -H 'Content-Type: application/json' \
  -d '{"tool":"quotemine","input":"your text here"}'
```

## Verify it works

```bash
npm test            # end-to-end suite against your local Ollama
```

Everything runs 100% offline. No API keys, no telemetry, no subscriptions.

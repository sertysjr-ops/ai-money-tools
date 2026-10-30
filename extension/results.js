// results.html — poll chrome.storage for the job the background worker posted.
const out = document.getElementById("out");
const meta = document.getElementById("meta");
const bar = document.getElementById("bar");
const src = document.getElementById("src");

function splitTweets(text) {
  // tweets arrive as "1/ ...", "2/ ..." separated by blank lines
  const chunks = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return chunks.map((c) => {
    const m = c.match(/^(\d+)\/\s*([\s\S]*)$/);
    return m ? { n: m[1], text: m[2] } : { n: "", text: c };
  });
}

function render(job) {
  if (!job) return;
  if (job.status === "working") return; // keep the spinner
  if (job.status === "error") {
    meta.textContent = "something broke";
    out.innerHTML = "";
    const d = document.createElement("div");
    d.className = "err";
    d.textContent = job.error;
    out.appendChild(d);
    return;
  }
  const tweets = splitTweets(job.output || "");
  meta.textContent = `${tweets.length} tweets · ${(job.tookMs / 1000).toFixed(1)}s · 100% local`;
  out.innerHTML = "";
  for (const t of tweets) {
    const div = document.createElement("div");
    div.className = "tweet";
    const len = document.createElement("span");
    const full = t.n ? `${t.n}/ ${t.text}` : t.text;
    len.className = "len" + (full.length > 280 ? " over" : "");
    len.textContent = full.length;
    const body = document.createElement("span");
    if (t.n) {
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = `${t.n}/`;
      body.appendChild(n);
    }
    body.appendChild(document.createTextNode(t.text));
    div.appendChild(len);
    div.appendChild(body);
    out.appendChild(div);
  }
  bar.style.display = "flex";
  src.textContent = "source: “" + (job.source || "").slice(0, 140) + "…”";
  document.getElementById("copy").onclick = async () => {
    const text = tweets.map((t) => (t.n ? `${t.n}/ ${t.text}` : t.text)).join("\n\n");
    await navigator.clipboard.writeText(text);
    document.getElementById("copy").textContent = "Copied ✓";
  };
  document.getElementById("close").onclick = () => window.close();
}

chrome.storage.local.get("threadsmithJob", (r) => render(r.threadsmithJob));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.threadsmithJob) render(changes.threadsmithJob.newValue);
});

// Threadsmith extension — background service worker.
// Right-click selected text → POST to the local dani-tools API → open results.

const API = "http://127.0.0.1:7890/api/run";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "threadsmith",
    title: "Threadsmith: turn into X thread",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "threadsmith" || !info.selectionText) return;

  const job = {
    status: "working",
    source: info.selectionText.slice(0, 500),
    startedAt: Date.now(),
  };
  await chrome.storage.local.set({ threadsmithJob: job });
  const resultTab = await chrome.tabs.create({ url: chrome.runtime.getURL("results.html") });

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "threadsmith",
        input: info.selectionText,
        flags: { tone: "casual", tweets: 7 },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await chrome.storage.local.set({
      threadsmithJob: { ...job, status: "done", output: data.output, tookMs: data.tookMs },
    });
  } catch (e) {
    await chrome.storage.local.set({
      threadsmithJob: {
        ...job,
        status: "error",
        error: `${e.message} — is the API running? (node serve.js in ai-tools)`,
      },
    });
  }
  // results.html polls storage, so nothing else to do here
  void resultTab;
});

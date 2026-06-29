/* popup.js — reads snapshots from storage and renders them. */

const STORAGE_KEY = "ytRecSnapshots";

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function render(snapshots) {
  const list = document.getElementById("list");
  list.innerHTML = "";

  if (!snapshots || snapshots.length === 0) {
    list.innerHTML =
      '<div class="empty">No snapshots yet. Browse YouTube\'s home page or watch a video, then reopen this popup.</div>';
    return;
  }

  snapshots.forEach((snap, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "snapshot" + (idx === 0 ? "" : " collapsed");

    const head = document.createElement("div");
    head.className = "snap-head";
    head.innerHTML =
      `<span class="badge">${snap.type === "home" ? "Home" : "Sidebar"}</span>` +
      `<span class="when">${timeAgo(snap.capturedAt)} · ${snap.items.length} videos</span>`;
    head.addEventListener("click", () => wrap.classList.toggle("collapsed"));

    const ul = document.createElement("ul");
    snap.items.forEach((it) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = it.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = it.title;
      li.appendChild(a);
      if (it.channel) {
        const c = document.createElement("div");
        c.className = "chan";
        c.textContent = it.channel;
        li.appendChild(c);
      }
      ul.appendChild(li);
    });

    wrap.appendChild(head);
    wrap.appendChild(ul);
    list.appendChild(wrap);
  });
}

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  render([]);
});

(async () => {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  render(data[STORAGE_KEY] || []);
})();

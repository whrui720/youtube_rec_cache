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

function shorten(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1).trimEnd() + "…" : str;
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

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent =
      snap.type === "home" ? "Home" : snap.type === "shorts" ? "Shorts" : "Sidebar";
    head.appendChild(badge);

    // For sidebar and Shorts snapshots, show which video these came from.
    if ((snap.type === "watch" || snap.type === "shorts") && snap.context) {
      const ctx = document.createElement("span");
      ctx.className = "context";
      ctx.textContent = shorten(snap.context, 60);
      ctx.title = snap.context; // full title on hover
      head.appendChild(ctx);
    }

    const when = document.createElement("span");
    when.className = "when";
    when.textContent = `${timeAgo(snap.capturedAt)} · ${snap.items.length} videos`;
    head.appendChild(when);

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
      // Shorts look identical to normal videos here (title + channel), so tag
      // them so you can tell them apart at a glance.
      if (it.isShort) {
        const tag = document.createElement("span");
        tag.className = "short-tag";
        tag.textContent = "Short";
        a.after(tag);
      }
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

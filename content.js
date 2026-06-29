/*
 * content.js
 * Runs on every youtube.com page. Listens for SPA navigation, scrapes the
 * visible recommendation list (home feed OR watch-page sidebar), and stores a
 * snapshot. Keeps only the most recent MAX_SNAPSHOTS pages.
 */

const MAX_SNAPSHOTS = 10;
const STORAGE_KEY = "ytRecSnapshots";

// ---- Scrapers -------------------------------------------------------------
// Each returns an array of { title, url, channel } or [] if nothing found.
// Selectors are the fragile part: if YouTube changes its markup, fix these.

function scrapeHomeFeed() {
  const items = [];
  // Home feed grid items
  document
    .querySelectorAll("ytd-rich-item-renderer a#video-title-link, ytd-rich-item-renderer a#video-title")
    .forEach((a) => {
      const title = a.getAttribute("title") || a.textContent.trim();
      const href = a.href;
      if (title && href) {
        const channel =
          a.closest("ytd-rich-item-renderer")?.querySelector("ytd-channel-name #text")?.textContent?.trim() || "";
        items.push({ title, url: href, channel });
      }
    });
  return items;
}

function scrapeWatchSidebar() {
  const items = [];
  // Related/recommended videos in the right rail of a watch page
  document
    .querySelectorAll("ytd-watch-next-secondary-results-renderer a#video-title, yt-lockup-view-model a.yt-lockup-metadata-view-model__title")
    .forEach((a) => {
      const title = a.getAttribute("title") || a.textContent.trim();
      const href = a.href;
      if (title && href) {
        items.push({ title, url: href, channel: "" });
      }
    });
  return items;
}

function detectPageType() {
  const path = location.pathname;
  if (path === "/" || path === "/index") return "home";
  if (path === "/watch") return "watch";
  return null; // ignore search, channel pages, etc. (extend if you want them)
}

// ---- Snapshot storage -----------------------------------------------------

async function saveSnapshot() {
  const type = detectPageType();
  if (!type) return;

  const items = type === "home" ? scrapeHomeFeed() : scrapeWatchSidebar();
  if (items.length === 0) return; // nothing rendered yet; a retry will catch it

  // De-dupe within this snapshot, cap the per-page list so storage stays small
  const seen = new Set();
  const deduped = items
    .filter((it) => {
      if (seen.has(it.url)) return false;
      seen.add(it.url);
      return true;
    })
    .slice(0, 40);

  const snapshot = {
    type,
    pageUrl: location.href,
    capturedAt: Date.now(),
    items: deduped,
  };

  const data = await chrome.storage.local.get(STORAGE_KEY);
  const list = data[STORAGE_KEY] || [];

  // Avoid storing back-to-back duplicates of the exact same page URL
  if (list.length && list[0].pageUrl === snapshot.pageUrl &&
      Date.now() - list[0].capturedAt < 4000) {
    list[0] = snapshot; // refresh the most recent instead of duplicating
  } else {
    list.unshift(snapshot);
  }

  const trimmed = list.slice(0, MAX_SNAPSHOTS);
  await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
}

// ---- Triggering: SPA-aware ------------------------------------------------
// YouTube doesn't fire normal page loads. It dispatches yt-navigate-finish.
// We also retry a few times because the feed renders asynchronously after
// the navigation event fires.

function captureWithRetries() {
  let attempts = 0;
  const maxAttempts = 6;
  const interval = setInterval(() => {
    attempts++;
    saveSnapshot();
    if (attempts >= maxAttempts) clearInterval(interval);
  }, 800);
}

window.addEventListener("yt-navigate-finish", captureWithRetries);
// Initial load (the very first page, before any SPA navigation)
captureWithRetries();

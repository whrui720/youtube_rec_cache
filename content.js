/*
 * content.js
 * Runs on every youtube.com page. Listens for SPA navigation, scrapes the
 * visible recommendation list (home feed OR watch-page sidebar), and stores a
 * snapshot. Keeps only the most recent MAX_SNAPSHOTS pages.
 */

const MAX_SNAPSHOTS = 10;
const STORAGE_KEY = "ytRecSnapshots";
const DEBUG = true; // logs capture activity to the page console (F12) for troubleshooting

// ---- Scrapers -------------------------------------------------------------
// Each returns an array of { title, url, channel, isShort } or [] if nothing
// found.
//
// Rather than target YouTube's ever-changing element IDs/classes, we anchor on
// the one thing that stays stable: recommendation entries are <a> tags whose
// href points at "/watch?v=..." (regular videos) or "/shorts/..." (Shorts). We
// pull the title from whatever attribute or child element happens to hold it.
// This survives most YouTube redesigns.

// Read a title from an anchor. Returns { title, clean } where `clean` means it
// came from a real title element (not a fallback). Every video/Short card has
// TWO links to the same target — a thumbnail link whose only text is the
// duration overlay or a "50 videos" playlist badge, and the actual title link.
// We must read from the title-holding elements and ignore the thumbnail's badge
// text.
function readTitle(a) {
  let title = (
    (a.getAttribute("title") || "").trim() ||
    (a.querySelector(
      "#video-title, h3, yt-formatted-string, .shortsLockupViewModelHostMetadataTitle"
    )?.textContent || "").trim()
  ).replace(/\s+/g, " ");

  if (title) {
    // Guard against a stray badge sneaking in: reject a pure duration ("10:23",
    // "1:04:33") or a bare count ("50 videos").
    if (/^[\d:]+$/.test(title) || /^\d+\s+videos?$/i.test(title)) return { title: "", clean: false };
    return { title, clean: true };
  }

  // Last resort: aria-label (often "Title by Channel, 1.2M views, 10 minutes").
  // Lower priority so a clean title always wins over this messier form.
  const aria = (a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
  return { title: aria, clean: false };
}

function extractVideoLinks(root) {
  const byHref = new Map(); // href -> { url, title, channel, clean, isShort }

  root
    .querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]')
    .forEach((a) => {
      const href = a.href;
      if (!href) return;

      const isShort = href.includes("/shorts/");

      const { title, clean } = readTitle(a);
      if (!title) return;

      // Keep the best title we find for each URL: a clean title beats a
      // fallback, and we don't overwrite an existing clean one.
      const existing = byHref.get(href);
      if (existing && (existing.clean || !clean)) return;

      const card = a.closest(
        "ytd-rich-item-renderer, yt-lockup-view-model, ytd-compact-video-renderer, ytd-video-renderer, ytm-shorts-lockup-view-model, ytd-reel-item-renderer"
      );
      const channel =
        card
          ?.querySelector(
            "ytd-channel-name #text, .yt-content-metadata-view-model-wiz__metadata-text"
          )
          ?.textContent?.trim() || "";

      byHref.set(href, { url: href, title, channel, clean, isShort });
    });

  return [...byHref.values()].map(({ url, title, channel, isShort }) => ({
    url,
    title,
    channel,
    isShort,
  }));
}

function scrapeHomeFeed() {
  const root =
    document.querySelector("ytd-rich-grid-renderer") ||
    document.querySelector("#primary #contents") ||
    document;
  return extractVideoLinks(root);
}

function scrapeWatchSidebar() {
  const root =
    document.querySelector("ytd-watch-next-secondary-results-renderer") ||
    document.querySelector("#secondary") ||
    document.querySelector("#related") ||
    document;
  return extractVideoLinks(root);
}

// The Shorts player (/shorts/<id>) has no sidebar list; instead it loads a
// vertical reel of Shorts. Scrape whatever Short/video links the reel has
// rendered so the "next up" Shorts you were served aren't lost on navigation.
function scrapeShorts() {
  const root =
    document.querySelector("ytd-shorts") ||
    document.querySelector("#shorts-container") ||
    document;
  return extractVideoLinks(root);
}

// Title of the item currently playing on a /watch or /shorts page, used to
// label the snapshot ("Sidebar: <title>") so you can tell whose
// recommendations these are.
function currentVideoTitle() {
  const el = document.querySelector(
    "ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata, #above-the-fold #title h1, " +
      "ytd-reel-video-renderer[is-active] .ytShortsVideoTitleViewModelShortsVideoTitle, " +
      "ytd-reel-player-header-renderer .title"
  );
  const t = el?.textContent?.trim();
  if (t) return t;
  // Fallback: the tab title, minus the notification count and " - YouTube".
  return (document.title || "")
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s*-\s*YouTube\s*$/, "")
    .trim();
}

function detectPageType() {
  const path = location.pathname;
  if (path === "/" || path === "/index") return "home";
  if (path === "/watch") return "watch";
  if (path.startsWith("/shorts/")) return "shorts";
  return null; // ignore search, channel pages, etc. (extend if you want them)
}

// ---- Snapshot storage -----------------------------------------------------

async function saveSnapshot() {
  const type = detectPageType();
  if (!type) return;

  const items =
    type === "home"
      ? scrapeHomeFeed()
      : type === "shorts"
      ? scrapeShorts()
      : scrapeWatchSidebar();
  if (items.length === 0) {
    if (DEBUG) console.debug("[yt-rec-cache] %s page: 0 items scraped (not ready yet or selectors broken)", type);
    return; // nothing rendered yet; a retry will catch it
  }

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
  if (type === "watch" || type === "shorts") snapshot.context = currentVideoTitle();

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
  if (DEBUG) console.debug("[yt-rec-cache] saved %s snapshot with %d items", type, deduped.length);
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

// YouTube dispatches yt-navigate-finish on `document`; depending on the build
// it may or may not bubble to `window`, so listen on both to be safe.
document.addEventListener("yt-navigate-finish", captureWithRetries);
window.addEventListener("yt-navigate-finish", captureWithRetries);
// Initial load (the very first page, before any SPA navigation)
if (DEBUG) console.debug("[yt-rec-cache] content script loaded on", location.href);
captureWithRetries();

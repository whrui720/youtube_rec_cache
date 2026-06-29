# YouTube Recommendation Snapshotter

A minimal Chrome (Manifest V3) extension that keeps a rolling cache of the
recommendation lists from the **last 10 YouTube pages** you visited — whether
that's the home feed or the related-videos sidebar on a watch page. When the
"back" button reshuffles your recommendations, your previous lists are still
sitting in the popup as plain title + link.

## How it works

YouTube is a single-page app, so it does not trigger ordinary page loads when
you navigate. The content script listens for YouTube's own
`yt-navigate-finish` event, waits for the feed to render (retrying a few times
because rendering is asynchronous), then scrapes the visible recommendation
items straight out of the DOM and stores `{ title, url, channel }` for each.
Snapshots are kept newest-first and trimmed to the 10 most recent.

Data lives in `chrome.storage.local` — nothing leaves your browser.

## Install (unpacked, for development)

1. Clone or download this repo.
2. Add real PNG icons at `icons/icon16.png`, `icon48.png`, `icon128.png`
   (any square images work; see `icons/README.txt`).
3. Go to `chrome://extensions`.
4. Toggle **Developer mode** on (top right).
5. Click **Load unpacked** and select this folder.
6. Browse YouTube, then click the toolbar icon to see your snapshots.

## Configuration

- `MAX_SNAPSHOTS` in `content.js` — how many pages to remember (default 10).
- The per-page item cap (`.slice(0, 40)`) limits how many videos are stored
  per snapshot so `storage.local` stays small.

## The fragile part

The scraping selectors in `content.js` (`scrapeHomeFeed` /
`scrapeWatchSidebar`) target YouTube's current markup. YouTube changes its DOM
periodically. If snapshots stop capturing, open DevTools on a YouTube page,
inspect a recommendation link, and update the selectors. This is expected
maintenance for any scraper-based YouTube tool.

### Want it more robust?

Swap DOM scraping for network interception: monkey-patch `fetch` /
`XMLHttpRequest` to capture the JSON responses from
`/youtubei/v1/browse` (home) and `/youtubei/v1/next` (watch sidebar), then
parse video IDs/titles from the payload. More durable against UI changes, but
the JSON is deeply nested and also shifts over time. The capture function is
isolated in `content.js` so this swap is localized.

## File map

| File           | Role                                                        |
|----------------|-------------------------------------------------------------|
| `manifest.json`| MV3 config: permissions, content script, popup              |
| `content.js`   | Injected into YouTube; detects navigation, scrapes, stores  |
| `popup.html`   | Popup markup + styling (light/dark aware)                   |
| `popup.js`     | Reads storage, renders snapshots, "Clear all"               |

## Limitations

- Captures only `/` (home) and `/watch` (sidebar). Extend `detectPageType()`
  for search or channel pages.
- Opening a video in a **new tab** (middle-click) remains the simplest way to
  never lose a feed in the first place; this extension is the safety net for
  when you forget.
- Selector breakage on YouTube redesigns is inherent to the approach.

## License

MIT

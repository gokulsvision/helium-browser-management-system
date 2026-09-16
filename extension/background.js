const HOST = "com.browsermanagement.system";
const DEFAULT_CAP_MB = 5120;
const ARCHIVE_MAX = 300;

const TOPIC_HOSTS = {
  Video: ["youtube.com", "youtu.be", "vimeo.com", "netflix.com", "twitch.tv"],
  Social: ["x.com", "twitter.com", "instagram.com", "facebook.com", "reddit.com", "linkedin.com"],
  Mail: ["outlook.live.com", "mail.google.com", "gmail.com"],
  Code: ["github.com", "gitlab.com", "localhost"],
  Docs: ["docs.google.com", "notion.so", "dropbox.com", "drive.google.com"],
  AI: ["grok.com", "claude.ai", "chatgpt.com", "gemini.google.com", "x.ai"],
};

let capMb = DEFAULT_CAP_MB;
let lastRss = 0;
let lastDiscarded = 0;
let lastError = null;
let archive = [];

chrome.storage.local.get({ capMb: DEFAULT_CAP_MB, archive: [] }, (s) => {
  capMb = s.capMb || DEFAULT_CAP_MB;
  archive = Array.isArray(s.archive) ? s.archive : [];
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.capMb && changes.capMb.newValue) capMb = changes.capMb.newValue;
  if (changes.archive && changes.archive.newValue) archive = changes.archive.newValue;
});

function topicFor(url, title) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "Other";
  }
  for (const [topic, hosts] of Object.entries(TOPIC_HOSTS)) {
    if (hosts.some((h) => host === h || host.endsWith("." + h))) return topic;
  }
  const parts = host.split(".");
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return host || "Other";
}

function setBadge(rssMb) {
  lastRss = rssMb;
  const gb = (rssMb / 1024).toFixed(1);
  chrome.browserAction.setBadgeText({ text: gb });
  chrome.browserAction.setBadgeBackgroundColor({
    color: rssMb > capMb ? "#c0392b" : rssMb > capMb * 0.85 ? "#d68910" : "#1e8449",
  });
}

function getRss(cb) {
  let finished = false;
  const done = (rss, err) => {
    if (finished) return;
    finished = true;
    lastError = err || null;
    cb(rss, err);
  };
  const t = setTimeout(() => done(null, "timeout"), 2500);
  try {
    const port = chrome.runtime.connectNative(HOST);
    port.onMessage.addListener((msg) => {
      clearTimeout(t);
      try { port.disconnect(); } catch (e) {}
      done(msg && typeof msg.rss_mb === "number" ? msg.rss_mb : null, null);
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(t);
      const err = (chrome.runtime.lastError && chrome.runtime.lastError.message) || "disconnected";
      done(null, err);
    });
    port.postMessage({ type: "rss" });
  } catch (e) {
    clearTimeout(t);
    done(null, String(e));
  }
}

function saveArchive(items, extra) {
  archive = items.slice(0, ARCHIVE_MAX);
  const payload = { archive, lastRss, capMb, updatedAt: Date.now(), ...(extra || {}) };
  chrome.storage.local.set(payload);
  try {
    const port = chrome.runtime.connectNative(HOST);
    port.postMessage({ type: "save", archive });
    setTimeout(() => { try { port.disconnect(); } catch (e) {} }, 500);
  } catch (e) {}
}

function remember(tab) {
  const item = {
    url: tab.url,
    title: tab.title || tab.url,
    topic: topicFor(tab.url || "", tab.title || ""),
    lastAccessed: tab.lastAccessed || Date.now(),
    hibernatedAt: Date.now(),
  };
  archive = [item, ...archive.filter((x) => x.url !== item.url)].slice(0, ARCHIVE_MAX);
}

function discardable(tab) {
  if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) return false;
  if (tab.active || tab.highlighted || tab.pinned || tab.discarded) return false;
  if (tab.audible) return false;
  const u = tab.url || "";
  if (u.startsWith("chrome://") || u.startsWith("helium://") || u.startsWith("chrome-extension://")) return false;
  if (u.startsWith("about:")) return false;
  return true;
}

function enforce(rssMb, cb) {
  if (rssMb == null || rssMb <= capMb) {
    lastDiscarded = 0;
    if (cb) cb(0);
    return;
  }
  chrome.tabs.query({}, (tabs) => {
    // Oldest last-accessed first. That is the whole policy.
    const candidates = tabs.filter(discardable).sort((a, b) => {
      return (a.lastAccessed || 0) - (b.lastAccessed || 0);
    });
    let n = 0;
    const go = (i) => {
      if (i >= candidates.length) {
        lastDiscarded = n;
        saveArchive(archive, { lastDiscarded: n });
        if (cb) cb(n);
        return;
      }
      const tab = candidates[i];
      remember(tab);
      chrome.tabs.discard(tab.id, () => {
        n += 1;
        if (n % 3 === 0) {
          getRss((now) => {
            if (now != null) setBadge(now);
            if (now != null && now <= capMb) {
              lastDiscarded = n;
              saveArchive(archive, { lastDiscarded: n });
              if (cb) cb(n);
              return;
            }
            go(i + 1);
          });
        } else {
          go(i + 1);
        }
      });
    };
    go(0);
  });
}

function tick() {
  getRss((rss, err) => {
    if (rss == null) {
      chrome.browserAction.setBadgeText({ text: "?" });
      chrome.browserAction.setTitle({
        title: "Browser Management System: helper not connected" + (err ? " (" + err + ")" : ""),
      });
      chrome.storage.local.set({ lastError: err || "no rss" });
      return;
    }
    setBadge(rss);
    chrome.browserAction.setTitle({
      title: "Browser " + (rss / 1024).toFixed(2) + " GB / " + (capMb / 1024).toFixed(1) + " GB cap",
    });
    chrome.storage.local.set({ lastRss: rss, lastError: null });
    enforce(rss);
  });
}

function schedule() {
  chrome.alarms.create("ramcap", { periodInMinutes: 1 });
  tick();
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "ramcap") tick();
});
chrome.tabs.onActivated.addListener(() => tick());
chrome.tabs.onCreated.addListener(() => tick());
chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onInstalled.addListener(schedule);
schedule();
setInterval(tick, 20000);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "status") {
    sendResponse({
      rss: lastRss,
      capMb,
      discarded: lastDiscarded,
      error: lastError,
      archive,
    });
    return true;
  }
  if (msg && msg.type === "enforce") {
    getRss((rss) => {
      if (rss != null) setBadge(rss);
      enforce(rss, (n) => sendResponse({ rss, discarded: n, capMb, archive }));
    });
    return true;
  }
  if (msg && msg.type === "restore") {
    const url = msg.url;
    if (url) chrome.tabs.create({ url, active: true });
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === "restore-topic") {
    const topic = msg.topic;
    const urls = archive.filter((x) => x.topic === topic).map((x) => x.url);
    urls.slice(0, 15).forEach((url, i) => {
      chrome.tabs.create({ url, active: i === 0 });
    });
    sendResponse({ ok: true, n: Math.min(urls.length, 15) });
    return true;
  }
});

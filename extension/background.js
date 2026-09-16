const HOST = "com.browsermanagement.system";
const DEFAULT_CAP_MB = 5120;
const ARCHIVE_MAX = 300;
const MB_PER_TAB_ESTIMATE = 120;
const QUIET_POLL_MIN = 2;
const HOT_POLL_MIN = 1;

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
let port = null;
let inflight = null;
let busy = false;
let lastWrite = 0;

chrome.storage.local.get({ capMb: DEFAULT_CAP_MB, archive: [] }, (s) => {
  capMb = s.capMb || DEFAULT_CAP_MB;
  archive = Array.isArray(s.archive) ? s.archive : [];
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.capMb && changes.capMb.newValue) capMb = changes.capMb.newValue;
});

function topicFor(url) {
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

function connect() {
  if (port) return port;
  try {
    port = chrome.runtime.connectNative(HOST);
    port.onDisconnect.addListener(() => {
      port = null;
    });
    return port;
  } catch (e) {
    port = null;
    lastError = String(e);
    return null;
  }
}

function native(msg, cb) {
  const p = connect();
  if (!p) {
    cb(null, lastError || "no host");
    return;
  }
  let done = false;
  const finish = (value, err) => {
    if (done) return;
    done = true;
    lastError = err || null;
    cb(value, err);
  };
  const t = setTimeout(() => finish(null, "timeout"), 2500);
  const onMsg = (reply) => {
    p.onMessage.removeListener(onMsg);
    clearTimeout(t);
    finish(reply, null);
  };
  p.onMessage.addListener(onMsg);
  try {
    p.postMessage(msg);
  } catch (e) {
    clearTimeout(t);
    port = null;
    finish(null, String(e));
  }
}

function getRss(cb) {
  native({ type: "rss" }, (reply, err) => {
    if (reply && typeof reply.rss_mb === "number") {
      cb(reply.rss_mb, null);
      return;
    }
    cb(null, err || "no rss");
  });
}

function persistArchive(forceDisk) {
  const now = Date.now();
  if (!forceDisk && now - lastWrite < 5000) {
    chrome.storage.local.set({ archive, lastRss, lastDiscarded });
    return;
  }
  lastWrite = now;
  chrome.storage.local.set({ archive, lastRss, capMb, lastDiscarded, updatedAt: now });
  native({ type: "save", archive }, () => {});
}

function remember(tab) {
  const item = {
    url: tab.url,
    title: tab.title || tab.url,
    topic: topicFor(tab.url || ""),
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
  if (
    u.startsWith("chrome://") ||
    u.startsWith("helium://") ||
    u.startsWith("chrome-extension://") ||
    u.startsWith("about:")
  ) {
    return false;
  }
  return true;
}

function setPollRate(hot) {
  chrome.alarms.create("ramcap", { periodInMinutes: hot ? HOT_POLL_MIN : QUIET_POLL_MIN });
}

function enforce(rssMb, cb) {
  if (rssMb == null || rssMb <= capMb) {
    lastDiscarded = 0;
    setPollRate(false);
    if (cb) cb(0);
    return;
  }
  if (busy) {
    if (cb) cb(0);
    return;
  }
  busy = true;
  setPollRate(true);
  chrome.tabs.query({}, (tabs) => {
    const candidates = tabs.filter(discardable).sort((a, b) => {
      return (a.lastAccessed || 0) - (b.lastAccessed || 0);
    });
    const over = rssMb - capMb;
    const want = Math.min(candidates.length, Math.max(1, Math.ceil(over / MB_PER_TAB_ESTIMATE)));
    const batch = candidates.slice(0, want);
    batch.forEach(remember);
    let left = batch.length;
    if (!left) {
      busy = false;
      lastDiscarded = 0;
      if (cb) cb(0);
      return;
    }
    batch.forEach((tab) => {
      chrome.tabs.discard(tab.id, () => {
        left -= 1;
        if (left > 0) return;
        lastDiscarded = batch.length;
        persistArchive(true);
        busy = false;
        getRss((now) => {
          if (now != null) setBadge(now);
          if (now != null && now > capMb) enforce(now, cb);
          else if (cb) cb(batch.length);
        });
      });
    });
  });
}

function tick() {
  if (inflight) return;
  inflight = true;
  getRss((rss, err) => {
    inflight = false;
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
      title: (rss / 1024).toFixed(2) + " GB / " + (capMb / 1024).toFixed(1) + " GB",
    });
    if (Math.abs(rss - lastRss) > 40) {
      chrome.storage.local.set({ lastRss: rss, lastError: null });
    }
    enforce(rss);
  });
}

function schedule() {
  setPollRate(false);
  tick();
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "ramcap") tick();
});
chrome.tabs.onCreated.addListener(() => {
  chrome.tabs.query({ discarded: false }, (tabs) => {
    if (tabs.length > 18) tick();
  });
});
chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onInstalled.addListener(schedule);
schedule();

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
      enforce(rss, (n) => sendResponse({ rss: lastRss, discarded: n, capMb, archive }));
    });
    return true;
  }
  if (msg && msg.type === "restore") {
    if (msg.url) chrome.tabs.create({ url: msg.url, active: true });
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === "restore-topic") {
    const urls = archive.filter((x) => x.topic === msg.topic).map((x) => x.url);
    urls.slice(0, 8).forEach((url, i) => chrome.tabs.create({ url, active: i === 0 }));
    sendResponse({ ok: true, n: Math.min(urls.length, 8) });
    return true;
  }
});

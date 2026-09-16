const HOST = "com.browsermanagement.system";
const DEFAULT_CAP_MB = 5120;
const ARCHIVE_MAX = 400;
const MB_PER_TAB_ESTIMATE = 120;
const QUIET_POLL_MIN = 2;
const HOT_POLL_MIN = 1;
const IDLE_MS = 45 * 60 * 1000;
const IDLE_BATCH = 6;

let capMb = DEFAULT_CAP_MB;
let lastRss = 0;
let lastDiscarded = 0;
let lastError = null;
let archive = [];
let port = null;
let inflight = false;
let busy = false;
let lastWrite = 0;

chrome.storage.local.get({ capMb: DEFAULT_CAP_MB, archive: [] }, (s) => {
  capMb = s.capMb || DEFAULT_CAP_MB;
  archive = Array.isArray(s.archive) ? s.archive : [];
});

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
    if (cb) cb(value, err);
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
    if (reply && typeof reply.rss_mb === "number") cb(reply.rss_mb, null);
    else cb(null, err || "no rss");
  });
}

function persistArchive() {
  const now = Date.now();
  if (now - lastWrite < 4000) {
    chrome.storage.local.set({ archive, lastRss, lastDiscarded });
    return;
  }
  lastWrite = now;
  chrome.storage.local.set({ archive, lastRss, capMb, lastDiscarded, updatedAt: now, lastError });
  native({ type: "save", archive }, () => {});
}

function remember(tab) {
  const u = tab.url || "";
  if (!u || u.startsWith("chrome://") || u.startsWith("helium://") || u.startsWith("chrome-extension://")) return;
  const g = topicFor(u);
  const item = {
    url: u,
    title: tab.title || u,
    topic: g.topic,
    site: g.site,
    lastAccessed: tab.lastAccessed || Date.now(),
    hibernatedAt: Date.now(),
  };
  archive = [item, ...archive.filter((x) => x.url !== item.url)].slice(0, ARCHIVE_MAX);
}

function isInternal(tab) {
  const u = tab.url || "";
  return (
    !u ||
    u.startsWith("chrome://") ||
    u.startsWith("helium://") ||
    u.startsWith("chrome-extension://") ||
    u.startsWith("about:")
  );
}

function discardable(tab) {
  if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) return false;
  if (tab.active || tab.highlighted || tab.pinned || tab.discarded) return false;
  if (tab.audible) return false;
  if (isInternal(tab)) return false;
  return true;
}

function harvestDiscarded(tabs) {
  let added = 0;
  tabs.forEach((tab) => {
    if (!tab.discarded || isInternal(tab)) return;
    if (archive.some((x) => x.url === tab.url)) return;
    remember(tab);
    added += 1;
  });
  return added;
}

function setPollRate(hot) {
  chrome.alarms.create("ramcap", { periodInMinutes: hot ? HOT_POLL_MIN : QUIET_POLL_MIN });
}

function discardTabs(tabs, cb) {
  if (!tabs.length) {
    if (cb) cb(0);
    return;
  }
  tabs.forEach(remember);
  let left = tabs.length;
  tabs.forEach((tab) => {
    chrome.tabs.discard(tab.id, () => {
      left -= 1;
      if (left > 0) return;
      persistArchive();
      if (cb) cb(tabs.length);
    });
  });
}

function manage(rssMb, cb) {
  chrome.tabs.query({}, (tabs) => {
    const harvested = harvestDiscarded(tabs);
    const now = Date.now();
    const oldest = tabs.filter(discardable).sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

    const idle = oldest.filter((t) => now - (t.lastAccessed || now) > IDLE_MS).slice(0, IDLE_BATCH);

    let ramBatch = [];
    if (rssMb != null && rssMb > capMb) {
      const over = rssMb - capMb;
      const want = Math.min(oldest.length, Math.max(1, Math.ceil(over / MB_PER_TAB_ESTIMATE)));
      ramBatch = oldest.slice(0, want);
    }

    const seen = {};
    const batch = [];
    ramBatch.concat(idle).forEach((t) => {
      if (seen[t.id]) return;
      seen[t.id] = true;
      batch.push(t);
    });

    if (harvested && !batch.length) persistArchive();

    if (!batch.length) {
      lastDiscarded = 0;
      setPollRate(rssMb != null && rssMb > capMb * 0.9);
      if (cb) cb(0);
      return;
    }

    if (busy) {
      if (cb) cb(0);
      return;
    }
    busy = true;
    setPollRate(true);
    discardTabs(batch, (n) => {
      lastDiscarded = n;
      busy = false;
      if (rssMb != null && rssMb > capMb) {
        getRss((nowRss) => {
          if (nowRss != null) setBadge(nowRss);
          if (nowRss != null && nowRss > capMb) manage(nowRss, cb);
          else if (cb) cb(n);
        });
      } else if (cb) cb(n);
    });
  });
}

function tick() {
  if (inflight) return;
  inflight = true;
  getRss((rss, err) => {
    inflight = false;
    if (rss == null) {
      chrome.browserAction.setBadgeText({ text: "…" });
      chrome.browserAction.setTitle({
        title: "Browser Management System: helper not connected" + (err ? " (" + err + ")" : ""),
      });
      chrome.storage.local.set({ lastError: err || "no rss" });
      // Still file sleeping tabs even if RAM helper is down.
      manage(null);
      return;
    }
    setBadge(rss);
    chrome.browserAction.setTitle({
      title: (rss / 1024).toFixed(2) + " GB / " + (capMb / 1024).toFixed(1) + " GB",
    });
    chrome.storage.local.set({ lastRss: rss, lastError: null });
    manage(rss);
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
    sendResponse({ rss: lastRss, capMb, discarded: lastDiscarded, error: lastError, archive });
    return true;
  }
  if (msg && msg.type === "enforce") {
    getRss((rss) => {
      if (rss != null) setBadge(rss);
      manage(rss, (n) => sendResponse({ rss: lastRss, discarded: n, capMb, archive }));
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

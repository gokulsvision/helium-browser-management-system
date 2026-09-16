function fmt(mb) {
  if (mb == null || mb <= 0) return "…";
  return (mb / 1024).toFixed(2) + " GB";
}

function render(s) {
  if (!s) return;
  document.getElementById("rss").textContent = fmt(s.rss);
  document.getElementById("n").textContent = (s.discarded || 0) + " tabs";
  document.getElementById("err").textContent = s.error ? "Helper: " + s.error : "";
  const archive = s.archive || [];
  const by = {};
  archive.forEach((item) => {
    const t = item.topic || "Other";
    (by[t] = by[t] || []).push(item);
  });
  const root = document.getElementById("groups");
  const topics = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
  if (!topics.length) {
    root.textContent = "None yet. They appear here when RAM goes over 5 GB.";
    return;
  }
  root.innerHTML = "";
  topics.forEach((topic) => {
    const items = by[topic].slice(0, 8);
    const wrap = document.createElement("div");
    wrap.className = "topic";
    const h = document.createElement("div");
    h.className = "topic-h";
    h.innerHTML = "<span>" + topic + " · " + by[topic].length + "</span>";
    const btn = document.createElement("button");
    btn.textContent = "Reopen";
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "restore-topic", topic });
    });
    h.appendChild(btn);
    wrap.appendChild(h);
    items.forEach((item) => {
      const a = document.createElement("a");
      a.className = "item";
      a.href = "#";
      a.textContent = item.title || item.url;
      a.title = item.url;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: "restore", url: item.url });
      });
      wrap.appendChild(a);
    });
    root.appendChild(wrap);
  });
}

function refresh() {
  chrome.runtime.sendMessage({ type: "status" }, render);
}

document.getElementById("now").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "enforce" }, render);
});

refresh();

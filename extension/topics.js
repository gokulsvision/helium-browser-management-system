// URL-only grouping. No models. Host + path are enough for a shelf you can scan.
const HOST_TOPIC = [
  [["youtube.com", "youtu.be", "vimeo.com", "netflix.com", "twitch.tv", "music.youtube.com"], "Video"],
  [["x.com", "twitter.com", "instagram.com", "facebook.com", "reddit.com", "linkedin.com", "tiktok.com"], "Social"],
  [["outlook.live.com", "outlook.office.com", "mail.google.com", "gmail.com"], "Mail"],
  [["github.com", "gitlab.com", "gist.github.com", "localhost", "127.0.0.1"], "Code"],
  [["docs.google.com", "drive.google.com", "notion.so", "dropbox.com", "paper.dropbox.com"], "Docs"],
  [["grok.com", "claude.ai", "chatgpt.com", "gemini.google.com", "x.ai", "chat.openai.com"], "AI"],
  [["meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com", "webex.com"], "Meetings"],
  [["calendar.google.com", "calendar.notion.so"], "Calendar"],
  [["amazon.com", "ebay.com", "etsy.com"], "Shopping"],
  [["news.ycombinator.com", "nytimes.com", "bbc.com", "theverge.com", "arstechnica.com"], "News"],
];

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

function pathOf(url) {
  try {
    return new URL(url).pathname || "/";
  } catch (e) {
    return "/";
  }
}

function matchesHost(host, rule) {
  return host === rule || host.endsWith("." + rule);
}

function topicFor(url) {
  const host = hostOf(url);
  const path = pathOf(url);
  const segs = path.split("/").filter(Boolean);

  if (host === "music.youtube.com") return { topic: "Video", site: "YouTube Music" };
  if (host === "youtube.com" || host === "youtu.be") return { topic: "Video", site: "YouTube" };
  if (host === "github.com" || host === "gist.github.com") {
    const org = segs[0] && !["settings", "notifications", "pulls", "issues", "marketplace", "orgs", "login"].includes(segs[0])
      ? segs[0]
      : "";
    return { topic: "Code", site: org ? "GitHub / " + org : "GitHub" };
  }
  if (host === "docs.google.com") return { topic: "Docs", site: "Google Docs" };
  if (host === "drive.google.com") return { topic: "Docs", site: "Google Drive" };
  if (host === "mail.google.com" || host === "gmail.com") return { topic: "Mail", site: "Gmail" };
  if (host === "meet.google.com") return { topic: "Meetings", site: "Google Meet" };
  if (host.endsWith("zoom.us")) return { topic: "Meetings", site: "Zoom" };
  if (host === "x.com" || host === "twitter.com") return { topic: "Social", site: "X" };

  for (const [hosts, topic] of HOST_TOPIC) {
    if (hosts.some((h) => matchesHost(host, h))) {
      return { topic, site: host };
    }
  }
  const parts = host.split(".");
  const site = parts.length >= 2 ? parts.slice(-2).join(".") : host || "Other";
  return { topic: site, site };
}

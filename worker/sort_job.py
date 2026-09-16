#!/usr/bin/env python3
"""On-demand sorter. Starts a tiny local model, labels a pile, then unloads it.

Does not decide which browser tabs to hibernate. Browser Management System
does that by age and RAM. This job only classifies a folder or URL list
when you run it.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OLLAMA = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
MODEL = os.environ.get("SORT_JOB_MODEL", "qwen3.5:0.8b")
LABELS = (
    "code",
    "video",
    "mail",
    "docs",
    "meetings",
    "social",
    "ai",
    "shopping",
    "news",
    "other",
)
OUT_DIR = Path.home() / "Library/Application Support/Browser Management System/sort-jobs"
SKIP_NAMES = {".DS_Store", "Thumbs.db", ".localized"}
SKIP_EXT = {".crdownload", ".download", ".part", ".tmp"}


def ollama(path, payload, timeout=120):
    req = urllib.request.Request(
        OLLAMA + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ollama_get(path, timeout=10):
    with urllib.request.urlopen(OLLAMA + path, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ensure_ollama():
    try:
        ollama_get("/api/tags")
        return
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(20):
            try:
                ollama_get("/api/tags")
                return
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                time.sleep(0.25)
        raise SystemExit("Ollama is not running and did not start.")


def model_present():
    tags = ollama_get("/api/tags").get("models") or []
    names = [m.get("name") or "" for m in tags]
    return any(n == MODEL or n.startswith(MODEL) for n in names)


def pull_model():
    print("Pulling", MODEL, "(one-time, then reused)…", file=sys.stderr)
    ollama("/api/pull", {"name": MODEL, "stream": False}, timeout=3600)


def stop_model():
    try:
        ollama("/api/generate", {"model": MODEL, "keep_alive": 0, "prompt": ""}, timeout=30)
    except Exception:
        subprocess.run(["ollama", "stop", MODEL], check=False, capture_output=True)


def classify_one(text):
    prompt = (
        "Assign exactly one label from this list: "
        + ", ".join(LABELS)
        + ".\n"
        "Reply with JSON only, no markdown, no extra keys: {\"label\":\"other\"}\n"
        "Item:\n"
        + text.strip()[:500]
    )
    data = ollama(
        "/api/chat",
        {
            "model": MODEL,
            "stream": False,
            "keep_alive": "2m",
            "options": {"num_ctx": 256, "temperature": 0},
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=120,
    )
    raw = ((data.get("message") or {}).get("content") or "").strip()
    label = parse_label(raw)
    return label, raw


def parse_label(raw):
    start = raw.find("{")
    end = raw.rfind("}")
    blob = raw[start : end + 1] if start >= 0 and end > start else raw
    try:
        obj = json.loads(blob)
        lab = str(obj.get("label") or "").strip().lower()
        if lab in LABELS:
            return lab
    except json.JSONDecodeError:
        pass
    low = raw.lower()
    for lab in LABELS:
        if lab in low:
            return lab
    return "other"


def list_folder(folder: Path):
    items = []
    for p in sorted(folder.iterdir()):
        if p.name in SKIP_NAMES or p.name.startswith("."):
            continue
        if p.suffix.lower() in SKIP_EXT:
            continue
        items.append(
            {
                "kind": "file",
                "path": str(p),
                "name": p.name,
                "text": f"filename: {p.name}\nfolder: {folder.name}",
            }
        )
    return items


def list_urls(src: Path):
    raw = json.loads(src.read_text()) if src.suffix == ".json" else None
    rows = []
    if isinstance(raw, dict):
        rows = raw.get("items") or []
        for topic, group in (raw.get("topics") or {}).items():
            if isinstance(group, list):
                rows.extend(group)
    elif isinstance(raw, list):
        rows = raw
    else:
        for line in src.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                rows.append({"url": line, "title": ""})
    items = []
    seen = set()
    for row in rows:
        if isinstance(row, str):
            url, title = row, ""
        else:
            url = (row.get("url") or "").strip()
            title = (row.get("title") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        items.append(
            {
                "kind": "url",
                "url": url,
                "title": title,
                "text": f"title: {title}\nurl: {url}",
            }
        )
    return items


def apply_moves(results, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    moved = []
    for row in results:
        if row.get("kind") != "file" or not row.get("path"):
            continue
        src = Path(row["path"])
        if not src.exists():
            continue
        bucket = dest / row["label"]
        bucket.mkdir(parents=True, exist_ok=True)
        target = bucket / src.name
        n = 1
        while target.exists():
            target = bucket / f"{src.stem}-{n}{src.suffix}"
            n += 1
        shutil.move(str(src), str(target))
        row["moved_to"] = str(target)
        moved.append(row)
    return moved


def main():
    parser = argparse.ArgumentParser(
        description="Classify a folder or URL list with a tiny local model, then unload it."
    )
    parser.add_argument("target", help="Folder of files, or a .json/.txt list of URLs")
    parser.add_argument("--apply", action="store_true", help="Move files into labeled subfolders")
    parser.add_argument("--out", default="", help="JSON report path")
    parser.add_argument("--dest", default="", help="With --apply, parent folder for labels")
    args = parser.parse_args()

    target = Path(args.target).expanduser().resolve()
    if not target.exists():
        raise SystemExit(f"not found: {target}")

    if target.is_dir():
        items = list_folder(target)
        dest = Path(args.dest).expanduser() if args.dest else target
    else:
        items = list_urls(target)
        dest = Path(args.dest).expanduser() if args.dest else target.parent

    if not items:
        print(json.dumps({"count": 0, "results": []}, indent=2))
        return

    ensure_ollama()
    if not model_present():
        pull_model()

    results = []
    try:
        for i, item in enumerate(items, 1):
            label, raw = classify_one(item["text"])
            row = dict(item)
            row.pop("text", None)
            row["label"] = label
            results.append(row)
            print(f"[{i}/{len(items)}] {label:10} {item.get('name') or item.get('title') or item.get('url')}", file=sys.stderr)
    finally:
        stop_model()

    if args.apply and target.is_dir():
        apply_moves(results, dest)

    report = {
        "model": MODEL,
        "labels": list(LABELS),
        "count": len(results),
        "applied": bool(args.apply and target.is_dir()),
        "results": results,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = Path(args.out).expanduser() if args.out else OUT_DIR / f"job-{int(time.time())}.json"
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"wrote {out}", file=sys.stderr)


if __name__ == "__main__":
    main()

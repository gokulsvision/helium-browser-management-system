# Browser Management System

Keep **Helium**, Chrome, Brave, Edge, and other Chromium browsers under a **5 GB RAM budget**.

When the browser goes over 5 GB, the **oldest background tabs** hibernate first. They are not closed. They are saved and grouped by topic so you can reopen them later.

This is an extension plus a tiny native helper. It is not a Chromium fork.

## Why

Each live tab in a Chromium browser is its own process. Forty of them will fill a 16 GB Mac, force swap, and make the whole machine hitch. Hibernating old tabs is the same idea as Chrome Memory Saver, with a hard budget and a shelf of sleeping tabs you can browse later.

## How it runs (so it stays cheap)

The extension does **not** sit in a tight loop. Under the cap it checks about
every two minutes. Near or over 5 GB it checks more often. It does **not**
wake on every tab switch.

The native helper stays connected instead of launching Python on each check.
Hibernate is batched (estimate ~120 MB per sleeping tab) so it does not
measure RAM after every single discard.

Helium already freezes idle tabs and restores sessions lazily. This tool only
steps in when the whole process tree is still over 5 GB.

## Policy

1. Measure RAM for the browser that is running the extension.
2. If RSS ≤ 5 GB, do nothing.
3. If RSS > 5 GB, sort background tabs by last used (**oldest first**).
4. Skip the active tab, pinned tabs, tabs with sound, and `chrome://` / `helium://` pages.
5. Hibernate until we are back under 5 GB.
6. Save those URLs, grouped from the URL only (YouTube, GitHub/org, Gmail, Meet, …). No model.

Idle tabs (45+ minutes, not active/pinned/playing sound) also hibernate in small batches, and any tab Helium already put to sleep is filed into the same shelf. That is how grouping works even when you are under 5 GB.

## Install (macOS)

```bash
git clone https://github.com/gokulsvision/browser-management-system.git
cd browser-management-system
bash scripts/install.sh
```

Then in the browser:

1. Open `helium://extensions` or `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select the `extension` folder in this repo

Optional: `bash scripts/make-app.sh` builds `dist/Browser Management System.app`, which runs the installer.

## Sleeping tabs

Toolbar icon shows current RAM in GB.

The popup lists hibernated tabs by topic, with **Reopen**.

On disk:

`~/Library/Application Support/Browser Management System/hibernated.json`

## License

MIT

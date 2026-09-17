# Browser Management System

Keep **Helium** from filling RAM and disk — without logging you out.

This is **not** the file librarian (Downloads/Desktop). Tabs and caches only.

## What it is

Two cheap jobs, one policy file.

| | RAM | Disk |
|---|---|---|
| When | Browser is open | 3:00 AM, Helium quit |
| Does | Hibernate oldest background tabs | Delete listed **site caches** |
| Never | Close tabs, invent folders | Touch Cookies / Login Data / IndexedDB |

Policy lives in `POLICY.md` (copied to `~/Library/Application Support/Browser Management System/POLICY.md` on install). Add another `### site.com` under Disk cache when a site starts hoarding (Riverside did: ~18 GB of service-worker cache).

## RAM

- Cap **5 GB** for the whole Helium process tree.
- Oldest unused background tabs sleep first (not active, not pinned, not playing sound).
- Idle 45+ minutes also sleep, in small batches.
- Sleeping tabs are filed by URL (YouTube, GitHub/org, Gmail, …) so you can reopen them.
- No model. The helper stays connected and does not poll on every tab switch.

## Disk

- Default: **riverside.com** service-worker cache, nightly at 03:00.
- If Helium is still running, that night is skipped.
- Log: `~/Library/Logs/browser-management-system.log`

## Install (macOS)

```bash
git clone https://github.com/gokulsvision/browser-management-system.git
cd browser-management-system
bash scripts/install.sh
```

Then **Developer mode → Load unpacked** on the `extension` folder (`helium://extensions`).

## License

MIT

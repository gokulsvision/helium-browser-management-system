# Browser Management System policy

This file is the product. RAM and disk rules live here, not in one-off scripts.
The extension hibernates tabs. The nightly job only clears listed site caches.
It never deletes Cookies, Login Data, Local Storage, IndexedDB, or Sessions.

## RAM
cap_gb: 5
idle_minutes: 45
skip: active, pinned, audible, chrome://, helium://

## Disk cache
profile: Helium
keep: Cookies, Login Data, Local Storage, IndexedDB, Sessions, Bookmarks
if_running: skip

### riverside.com
clear: service-worker
hour: 3
minute: 0

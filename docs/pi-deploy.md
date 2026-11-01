# Running on the Pi with the NAS as storage

Target layout: the Synology NAS owns every file (Jellyfin libraries, the photo
share, the documents share). The Pi mounts the share, runs the app,
and keeps only disposable state (thumbnail cache, SQLite index).

```
NAS (192.168.1.58)                 Pi (192.168.1.17, wired)
  /volume1/photo      ──NFS──▶  /mnt/nas/photo      = PHOTOS_ROOT
  /volume1/documents  ──NFS──▶  /mnt/nas/documents  = FILES_ROOT
  Jellyfin :8096      ──HTTP─▶  JELLYFIN_URL
                                 ~/.cache/home-photos = PHOTOS_CACHE (local)
                                 ~/.cache/home-files  = FILES_CACHE (local)
                                 ~/data/airgradient.db = DB_PATH (local)
```

## 0. Keep the Pi's address fixed

The Pi (hardware address `88:A2:9E:06:F9:37`, hostname `RASBERRYPI`) is on
Ethernet and currently gets `192.168.1.17` by DHCP; it has no Wi‑Fi profile, so
the cable is its only link. Reserve that address for it in the router
(Netgear: Attached Devices → the Pi → Reserve, or LAN Setup → Address
Reservation) so the `pi` git remote, the NFS export and bookmarks stay valid.
On the laptop: `git remote set-url pi joey@192.168.1.17:~/air-gradient`.

## 1. Share the photo folder from the NAS

On the Synology, **Control Panel → Shared Folder → photo → Edit → NFS
Permissions → Create**: hostname `192.168.1.17`, privilege Read/Write, squash
"Map all users to admin" (simplest; the Pi's `joey` user then writes as the
NAS admin), enable asynchronous. Enable NFS itself under **File Services → NFS**
if it is off. Note the mount path shown at the bottom (`/volume1/photo`).

SMB works too (`//192.168.1.58/photo` with `cifs-utils` and a credentials file),
but NFS needs no password on the Pi and handles large uploads better.

## 2. Mount it on the Pi

```bash
sudo apt install -y nfs-common
sudo mkdir -p /mnt/nas/photo
```

Add to `/etc/fstab` (one line):

```
192.168.1.58:/volume1/photo  /mnt/nas/photo  nfs  defaults,_netdev,soft,timeo=30,retrans=2,noatime,nofail  0  0
```

`soft` + `nofail` matter: a NAS outage then surfaces as an error in the app
("Library offline") instead of hanging the Node process or blocking boot.

```bash
sudo systemctl daemon-reload
sudo mount -a
ls /mnt/nas/photo        # should list your photo folders
touch /mnt/nas/photo/.write-test && rm /mnt/nas/photo/.write-test
```

## 2b. Documents share

The Documents section (`/media/documents`, `docs/documents-spec.md`) stores its
folders on a dedicated share, set up exactly like `photo`:

1. On the Synology, **Control Panel → Shared Folder → Create**: name
   `documents` (enable the Recycle Bin if you want deleted documents to be
   recoverable from `#recycle`). Then **Edit → NFS Permissions → Create**:
   hostname `192.168.1.17`, privilege Read/Write, squash "Map all users to
   admin", enable asynchronous. The mount path is `/volume1/documents`.
2. On the Pi:

   ```bash
   sudo mkdir -p /mnt/nas/documents
   ```

   Add to `/etc/fstab` (one line):

   ```
   192.168.1.58:/volume1/documents  /mnt/nas/documents  nfs  defaults,_netdev,soft,timeo=30,retrans=2,noatime,nofail  0  0
   ```

   ```bash
   sudo systemctl daemon-reload
   sudo mount -a
   touch /mnt/nas/documents/.write-test && rm /mnt/nas/documents/.write-test
   ```

3. PDF thumbnails need `pdftoppm` (without it PDFs just show their type icon):

   ```bash
   sudo apt install -y poppler-utils
   ```

4. In `.env.local` (step 4): `FILES_ROOT=/mnt/nas/documents` and
   `NAS_REQUIRE_MOUNT=1`. With the flag set, a share that is not mounted (the
   bare `/mnt/nas/documents` directory on the SD card) is reported offline —
   Documents shows a banner and refuses every write, and Photos reports
   "Library offline" for an unmounted `/mnt/nas/photo` — instead of filling the
   SD card.

The old Files browser pointed `FILES_ROOT` at `/mnt/nas`; anything you kept
there that belongs in Documents can be moved into the new share from Finder
(SMB) or with `mv` on the NAS.

## 3. ffmpeg 7.1 or newer

Checked 2026-10-31: the Pi runs Debian 13 (trixie) with ffmpeg 7.1.3 and Node
22, so nothing to do here. The app stitches iPhone HEIC tile grids itself (ffmpeg
7.x alone returns a single tile or the portrait matte), so 7.1 is enough. For
reference, Raspberry Pi OS bookworm ships ffmpeg 5.1, which cannot read HEIC at
all; on such a system the options are, easiest first:

```bash
# a) static build (arm64), no system changes
mkdir -p ~/opt && cd ~/opt
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz | tar xJ
ls ~/opt/ffmpeg-*-static/ffmpeg   # then set FFMPEG_PATH / FFPROBE_PATH below
# b) Debian trixie's ffmpeg 7.x via apt pinning, or Raspberry Pi OS "trixie" when you upgrade
```

## 4. Environment on the Pi

In `~/air-gradient/.env.local` (never committed):

```
DEVICE_HOST=airgradient_XXXXXXXXXXXX.local     # or the device's IP
OUTDOOR_LAT=…
OUTDOOR_LON=…
DB_PATH=/home/joey/data/airgradient.db          # outside the checkout
FILES_ROOT=/mnt/nas/documents
NAS_REQUIRE_MOUNT=1                             # roots must be mounted NAS shares
FILES_CACHE=/home/joey/.cache/home-files
PHOTOS_ROOT=/mnt/nas/photo
PHOTOS_CACHE=/home/joey/.cache/home-photos
FFMPEG_PATH=/home/joey/opt/ffmpeg-7.1-arm64-static/ffmpeg     # if you did 3a
FFPROBE_PATH=/home/joey/opt/ffmpeg-7.1-arm64-static/ffprobe
JELLYFIN_URL=http://192.168.1.58:8096
JELLYFIN_USER=…
JELLYFIN_PASSWORD=…
```

```bash
mkdir -p ~/data ~/.cache/home-photos ~/.cache/home-files
# move the existing database out of the checkout once:
mv ~/air-gradient/airgradient.db* ~/data/ 2>/dev/null || true
```

Use a Jellyfin user that cannot delete media (Jellyfin → Dashboard → Users →
*user* → "Allow media deletion" off). The app only needs playback, favorites and
collection edits.

## 5. Deploy

On the Pi, once (the setup script was rewritten; re-run it even if you ran the
old one):

```bash
cd ~/air-gradient && git pull   # or let the first push below bring it
bash scripts/pi-setup.sh         # hook + PM2 ecosystem + boot startup
pm2 install pm2-logrotate
```

From the laptop, after merging the branch into `main`:

```bash
git push pi main
```

The hook installs (with dev dependencies, the build needs them), builds, prunes
and reloads PM2. First start after this release:

- prunes readings older than 30 days and closes the four events stuck since
  May/June (same retention policy as before, now applied on a timer),
- starts the AirGradient poller from the saved device host without a browser,
- scans the photo share about 3 s after boot, then every 6 h, and writes
  `/mnt/nas/photo/.photos-library` plus `.library/catalog.json`.

Watch it: `pm2 logs jarvis --lines 50`. Expect `[startup] AirGradient poller
started …` and `[photos] scan … added N`. Then open `http://<pi>:3000/media/photos`.

## 6. What to check on the first real run

| Check | Where |
|---|---|
| Library online, counts and free space match the NAS | Photos → ⋯ menu → library stats |
| HEIC thumbnails render (needs ffmpeg ≥ 7.1) | any iPhone photo tile |
| Jellyfin playback through the proxy (no `api_key` in any URL) | play a movie; browser devtools → Network |
| Favorite / watched sync | toggle in Reel, confirm in the Jellyfin web UI |
| Hue live updates survive a bridge reboot | lights page after power-cycling the bridge |
| NAS outage behaviour | unmount the share: Photos shows "Library offline", nothing is marked deleted |
| Documents offline guard | `sudo umount /mnt/nas/documents`: Documents shows the offline banner, uploads are refused (503); `sudo mount -a` brings it back |
| PDF thumbnails (needs poppler-utils) | any PDF tile in Documents |

## Recovery

Losing the Pi loses nothing: on a fresh Pi, repeat steps 2–5 (including 2b). The first scan
rebuilds the index from the share and restores favorites and albums from
`.library/catalog.json`. Thumbnails regenerate on demand.

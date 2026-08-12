#!/usr/bin/env python3
"""Local server for the RGoIF Matchdagsgenerator.

Serves the app itself (index.html, app.js, crest library) and exposes the
club's existing match-photo folders (Dambilder / Herrbilder) as a browsable
image library, converting HEIC and generating thumbnails on the fly via
macOS `sips` (no extra dependencies needed).

Run:  python3 server.py
"""
import json
import mimetypes
import subprocess
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

PORT = 8765
BASE_DIR = Path(__file__).resolve().parent
PHOTO_ROOT = BASE_DIR.parent / "Matchdagsbilder"
PHOTO_DIRS = {
    "dam": PHOTO_ROOT / "Dambilder",
    "herr": PHOTO_ROOT / "Herrbilder",
}
CREST_DIR = BASE_DIR.parent / "Logotyper till matchdagsbilder"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}
CREST_EXTS = {".png"}
CACHE_DIR = BASE_DIR / ".cache"
THUMB_DIR = CACHE_DIR / "thumbs"
FULL_DIR = CACHE_DIR / "full"
THUMB_DIR.mkdir(parents=True, exist_ok=True)
FULL_DIR.mkdir(parents=True, exist_ok=True)

PHOTO_INDEX = {}  # id -> Path
CREST_INDEX = {}  # id -> Path


def scan_crests():
    CREST_INDEX.clear()
    result = []
    if not CREST_DIR.is_dir():
        return result
    files = [f for f in CREST_DIR.iterdir() if f.is_file() and f.suffix.lower() in CREST_EXTS]
    files.sort(key=lambda f: f.stem.lower())
    for i, f in enumerate(files):
        cid = f"crest-{i}"
        CREST_INDEX[cid] = f
        result.append({"id": cid, "name": f.stem})
    return result


def scan_photos():
    PHOTO_INDEX.clear()
    result = {"dam": [], "herr": []}
    for category, folder in PHOTO_DIRS.items():
        if not folder.is_dir():
            continue
        files = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTS]
        files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
        for i, f in enumerate(files):
            pid = f"{category}-{i}"
            PHOTO_INDEX[pid] = f
            result[category].append({"id": pid, "name": f.name})
    return result


def ensure_thumb(pid, path):
    dest = THUMB_DIR / f"{pid}.jpg"
    if not dest.exists() or dest.stat().st_mtime < path.stat().st_mtime:
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-Z", "360", str(path), "--out", str(dest)],
            capture_output=True,
        )
    return dest


def ensure_full(pid, path):
    if path.suffix.lower() not in (".heic", ".heif"):
        return path
    dest = FULL_DIR / f"{pid}.jpg"
    if not dest.exists() or dest.stat().st_mtime < path.stat().st_mtime:
        subprocess.run(
            ["sips", "-s", "format", "jpeg", str(path), "--out", str(dest)],
            capture_output=True,
        )
    return dest


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path):
        if not path.exists() or not path.is_file():
            self.send_error(404, "Not found")
            return
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _serve_static(self, url_path):
        rel = url_path.lstrip("/")
        if rel == "":
            rel = "index.html"
        file = (BASE_DIR / rel).resolve()
        if BASE_DIR.resolve() not in file.parents and file != BASE_DIR.resolve():
            self.send_error(403)
            return
        self._send_file(file)

    def do_GET(self):
        parsed = urlsplit(self.path)
        route = parsed.path

        if route == "/api/photos":
            self._send_json(scan_photos())
            return

        if route == "/api/crests":
            self._send_json(scan_crests())
            return

        if route.startswith("/crest/"):
            cid = route[len("/crest/"):]
            path = CREST_INDEX.get(cid)
            if path is None:
                scan_crests()
                path = CREST_INDEX.get(cid)
            if path is None or not path.exists():
                self.send_error(404)
                return
            self._send_file(path)
            return

        if route.startswith("/thumb/"):
            pid = route[len("/thumb/"):]
            path = PHOTO_INDEX.get(pid)
            if path is None:
                scan_photos()
                path = PHOTO_INDEX.get(pid)
            if path is None or not path.exists():
                self.send_error(404)
                return
            self._send_file(ensure_thumb(pid, path))
            return

        if route.startswith("/full/"):
            pid = route[len("/full/"):]
            path = PHOTO_INDEX.get(pid)
            if path is None:
                scan_photos()
                path = PHOTO_INDEX.get(pid)
            if path is None or not path.exists():
                self.send_error(404)
                return
            self._send_file(ensure_full(pid, path))
            return

        self._serve_static(route)


def open_in_normal_safari_window(url):
    """Force a regular (non-Private-Browsing) Safari window.

    Plain webbrowser.open()/`open <url>` hands the URL to whatever Safari
    window happens to be frontmost — if that's a Private window, saved data
    (localStorage/IndexedDB) gets wiped the moment it's closed. Explicitly
    asking Safari to make a new document sidesteps that; Private windows are
    never created implicitly this way.
    """
    script = f'tell application "Safari"\nactivate\nmake new document with properties {{URL:"{url}"}}\nend tell'
    try:
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True)
    except Exception:
        webbrowser.open(url)  # fallback: some other default browser, or osascript unavailable


def main():
    scan_photos()
    scan_crests()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"
    print(f"Matchdagsgenerator körs på {url}  (Ctrl+C för att stoppa)")
    print("OBS: om du redan har ett privat Safari-fönster öppet, se till att detta")
    print("landar i ett VANLIGT fönster — annars raderas sparad data när du stänger det.")
    threading.Timer(0.6, lambda: open_in_normal_safari_window(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

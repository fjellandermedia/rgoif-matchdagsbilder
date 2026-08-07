#!/usr/bin/env python3
"""Scans queue/*.json for scheduled posts that are due and publishes them.

Run on a cron schedule by .github/workflows/publish.yml. Each queue file is
written by the web app (via the GitHub Contents API) with the shape:

  {
    "image_path": "images/2026-08-10T1530-ab12cd.jpg",
    "caption": "...",
    "platforms": ["facebook", "instagram"],
    "publish_at": "2026-08-10T13:30:00.000Z"
  }

Due files are published and moved to queue/done/; failures are left in
place (with the error recorded) so the next run retries them.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from publish import publish  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
QUEUE_DIR = ROOT / "queue"
DONE_DIR = QUEUE_DIR / "done"
FAILED_DIR = QUEUE_DIR / "failed"


def main():
    DONE_DIR.mkdir(exist_ok=True)
    FAILED_DIR.mkdir(exist_ok=True)

    now = datetime.now(timezone.utc)
    repo = os.environ["GITHUB_REPOSITORY"]
    ref = os.environ.get("GITHUB_REF_NAME", "main")

    due = []
    for f in sorted(QUEUE_DIR.glob("*.json")):
        data = json.loads(f.read_text())
        publish_at = datetime.fromisoformat(data["publish_at"].replace("Z", "+00:00"))
        if publish_at <= now:
            due.append((f, data))

    if not due:
        print("No due posts.")
        return

    for f, data in due:
        image_url = f"https://raw.githubusercontent.com/{repo}/{ref}/{data['image_path']}"
        try:
            result = publish(image_url, data.get("caption", ""), data.get("platforms", ["facebook", "instagram"]))
            print(f"Published {f.name}: {json.dumps(result)}")
            f.rename(DONE_DIR / f.name)
        except Exception as e:
            print(f"FAILED {f.name}: {e}", file=sys.stderr)
            attempts = data.get("attempts", 0) + 1
            data["attempts"] = attempts
            data["last_error"] = str(e)
            data["last_attempt"] = now.isoformat()
            if attempts >= 5:
                f.write_text(json.dumps(data, indent=2))
                f.rename(FAILED_DIR / f.name)
            else:
                f.write_text(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()

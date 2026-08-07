#!/usr/bin/env python3
"""Publish a match image to the RGoIF Facebook Page and/or Instagram account
via the Meta Graph API.

Instagram has no native scheduling in the Graph API (a media container
expires 24h after creation), so "scheduling" is handled outside of Meta
entirely — see process_queue.py, which calls the functions in this file at
the right time. This script only ever publishes immediately when run.

Required environment variables:
  META_PAGE_ACCESS_TOKEN  - long-lived Page / System User access token
  META_PAGE_ID            - Facebook Page ID
  META_IG_USER_ID         - Instagram Business Account ID (only needed
                             when publishing to Instagram)
"""
import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

GRAPH = "https://graph.facebook.com/v23.0"
POLL_ATTEMPTS = 20
POLL_DELAY_SECONDS = 3


def _request(url, data=None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    method = "POST" if data is not None else "GET"
    req = urllib.request.Request(url, data=body, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Graph API error {e.code}: {e.read().decode()}") from None


def _get(url, params):
    return _request(f"{url}?{urllib.parse.urlencode(params)}")


def publish_facebook(image_url, caption, token, page_id):
    return _request(f"{GRAPH}/{page_id}/photos", {
        "url": image_url,
        "caption": caption,
        "access_token": token,
    })


def publish_instagram(image_url, caption, token, ig_user_id):
    container = _request(f"{GRAPH}/{ig_user_id}/media", {
        "image_url": image_url,
        "caption": caption,
        "access_token": token,
    })
    creation_id = container["id"]

    for _ in range(POLL_ATTEMPTS):
        status = _get(f"{GRAPH}/{creation_id}", {"fields": "status_code", "access_token": token})
        code = status.get("status_code")
        if code == "FINISHED":
            break
        if code == "ERROR":
            raise RuntimeError(f"Instagram container failed to process: {status}")
        time.sleep(POLL_DELAY_SECONDS)
    else:
        raise RuntimeError(f"Instagram container {creation_id} never reached FINISHED in time")

    return _request(f"{GRAPH}/{ig_user_id}/media_publish", {
        "creation_id": creation_id,
        "access_token": token,
    })


def publish(image_url, caption, platforms):
    token = os.environ["META_PAGE_ACCESS_TOKEN"]
    results = {}
    if "facebook" in platforms:
        results["facebook"] = publish_facebook(image_url, caption, token, os.environ["META_PAGE_ID"])
    if "instagram" in platforms:
        results["instagram"] = publish_instagram(image_url, caption, token, os.environ["META_IG_USER_ID"])
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--image-url", required=True, help="Publicly reachable URL to the JPEG image")
    ap.add_argument("--caption", default="", help="Post caption / text")
    ap.add_argument("--platforms", default="facebook,instagram", help="Comma-separated: facebook,instagram")
    args = ap.parse_args()

    platforms = [p.strip() for p in args.platforms.split(",") if p.strip()]
    result = publish(args.image_url, args.caption, platforms)
    print(json.dumps(result, indent=2))

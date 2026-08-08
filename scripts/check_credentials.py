#!/usr/bin/env python3
"""Read-only sanity check for the Meta credentials wired up as GitHub
secrets. Confirms the Page token is valid and can see both the Facebook
Page and the linked Instagram Business Account — without publishing
anything. Safe to run as often as you like.
"""
import json
import os
import sys
import urllib.error
import urllib.request

GRAPH = "https://graph.facebook.com/v23.0"


def get(url, params):
    import urllib.parse
    qs = urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(f"{url}?{qs}") as resp:
            return True, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return False, e.read().decode()


def main():
    token = os.environ["META_PAGE_ACCESS_TOKEN"]
    page_id = os.environ["META_PAGE_ID"]
    ig_user_id = os.environ["META_IG_USER_ID"]

    ok = True

    print(f"Checking Facebook Page {page_id}...")
    success, result = get(f"{GRAPH}/{page_id}", {"fields": "id,name", "access_token": token})
    if success:
        print(f"  OK: connected to Page \"{result.get('name')}\" ({result.get('id')})")
    else:
        ok = False
        print(f"  FAILED: {result}")

    print(f"Checking Instagram Business Account {ig_user_id}...")
    success, result = get(f"{GRAPH}/{ig_user_id}", {"fields": "id,username", "access_token": token})
    if success:
        print(f"  OK: connected to Instagram @{result.get('username')} ({result.get('id')})")
    else:
        ok = False
        print(f"  FAILED: {result}")

    if not ok:
        print("\nOne or more checks failed — see errors above.", file=sys.stderr)
        sys.exit(1)
    print("\nAll good — credentials are correctly wired up.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Refresh data/repos.json: GitHub numbers for the repositories in software.txt.

Run weekly by .github/workflows/publications.yml (or by hand), so visitors
don't spend their own GitHub API allowance (60 requests an hour) on the
Software cards. Uses GITHUB_TOKEN when set, for a higher rate limit.

Standard library only.
"""
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "repos.json")


def repos_in_software_txt():
    repos = []
    with open(os.path.join(ROOT, "software.txt"), encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^repo\s*:\s*(\S+)", line.strip(), re.I)
            if m:
                repo = re.sub(r"^https?://github\.com/", "", m.group(1)).strip("/")
                if repo.count("/") == 1 and repo not in repos:
                    repos.append(repo)
    return repos


def get(url):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "njcuk9999.github.io repos"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:  # no such repo, or no releases
            return None
        raise


def main():
    out = {}
    for repo in repos_in_software_txt():
        d = get("https://api.github.com/repos/" + repo)
        if not d:
            print(f"{repo}: not found", file=sys.stderr)
            continue
        rel = get("https://api.github.com/repos/" + repo + "/releases/latest") or {}
        out[repo] = {"stars": d.get("stargazers_count", 0), "forks": d.get("forks_count", 0),
                     "lang": d.get("language"), "pushed": (d.get("pushed_at") or "")[:10],
                     "tag": rel.get("tag_name"), "relUrl": rel.get("html_url")}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "repos": out}, f, indent=1)
    print(f"{len(out)} repos -> {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()

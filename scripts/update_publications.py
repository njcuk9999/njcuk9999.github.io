#!/usr/bin/env python3
"""Refresh data/publications.json, the publications snapshot the site reads.

Run weekly by .github/workflows/publications.yml (or by hand). It saves the
works on the OpenAlex author profile, slimmed to the fields the pages use,
so visitors don't each have to page through the OpenAlex API. If the
ADS_TOKEN environment variable is set (a token from
https://ui.adsabs.harvard.edu/user/settings/token), ADS reads, citations and
bibcodes are added for papers claimed on the ORCID record.

Standard library only.
"""
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request

OPENALEX_ID = "A5078094363"
ORCID = "0000-0003-4166-4121"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "publications.json")
FIELDS = ("id,doi,title,publication_date,publication_year,type,cited_by_count,"
          "counts_by_year,primary_location,authorships,biblio")


def get_json(url, headers=None, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=dict({"User-Agent": "njcuk9999.github.io publications"},
                                                           **(headers or {})))
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # network blip or rate limit: back off and retry
            if attempt == tries - 1:
                raise
            print(f"retrying after {e}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))


def slim(w):
    """Keep only what assets/js/publications.js reads."""
    pl = w.get("primary_location") or {}
    src = pl.get("source") or {}
    authors = []
    for a in w.get("authorships") or []:
        au = a.get("author") or {}
        # other people's IDs aren't needed: the pages only look for mine
        mine = str(au.get("id", "")).endswith(OPENALEX_ID) or str(au.get("orcid", "")).endswith(ORCID)
        item = {"author": {k: au[k] for k in (("id", "display_name", "orcid") if mine else ("display_name",))
                           if au.get(k)}}
        if not au.get("display_name") and a.get("raw_author_name"):
            item["raw_author_name"] = a["raw_author_name"]
        authors.append(item)
    biblio = {k: v for k, v in (w.get("biblio") or {}).items() if v}
    out = {
        "id": w.get("id"),
        "doi": w.get("doi"),
        "title": w.get("title"),
        "publication_date": w.get("publication_date"),
        "publication_year": w.get("publication_year"),
        "type": w.get("type"),
        "cited_by_count": w.get("cited_by_count", 0),
        "counts_by_year": [{"year": c["year"], "cited_by_count": c["cited_by_count"]}
                           for c in w.get("counts_by_year") or []],
        "primary_location": {"landing_page_url": pl.get("landing_page_url"),
                             "source": {"display_name": src.get("display_name")} if src else None},
        "authorships": authors,
    }
    if biblio:
        out["biblio"] = biblio
    return out


def openalex_works():
    works, cursor = [], "*"
    while cursor:
        url = ("https://api.openalex.org/works?per-page=200&filter=author.id:" + OPENALEX_ID +
               "&select=" + FIELDS + "&cursor=" + urllib.parse.quote(cursor))
        d = get_json(url)
        results = d.get("results") or []
        works.extend(slim(w) for w in results)
        cursor = (d.get("meta") or {}).get("next_cursor") if results else None
    return works


def ads_numbers(token):
    """{doi or 'arxiv:<id>': [bibcode, reads, citations]} for papers on the ORCID record."""
    q = urllib.parse.urlencode({"q": "orcid:" + ORCID, "fl": "bibcode,doi,identifier,read_count,citation_count",
                                "rows": 2000})
    d = get_json("https://api.adsabs.harvard.edu/v1/search/query?" + q,
                 {"Authorization": "Bearer " + token})
    out = {}
    for doc in (d.get("response") or {}).get("docs") or []:
        row = [doc.get("bibcode"), doc.get("read_count", 0), doc.get("citation_count", 0)]
        for doi in doc.get("doi") or []:
            out[doi.lower()] = row
        for ident in doc.get("identifier") or []:
            if ident.lower().startswith("arxiv:"):
                out["arxiv:" + ident[6:].lower()] = row
    return out


def main():
    works = openalex_works()
    if not works:
        sys.exit("OpenAlex returned no works; keeping the old snapshot")
    snapshot = {
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "openalex": OPENALEX_ID,
        "orcid": ORCID,
        "works": works,
    }
    token = os.environ.get("ADS_TOKEN", "").strip()
    if token:
        try:
            snapshot["ads"] = ads_numbers(token)
        except Exception as e:  # ADS down: still publish the OpenAlex part
            print(f"ADS lookup failed: {e}", file=sys.stderr)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(works)} works" + (f", {len(snapshot['ads'])} ADS entries" if "ads" in snapshot else "") +
          f" -> {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()

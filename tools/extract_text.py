#!/usr/bin/env python3
"""Extract visible text from a URL (or a saved HTML file) for quick reading.

Usage:
  python tools/extract_text.py <url> [--out FILE] [--min-len N]
  python tools/extract_text.py --file path.html
"""
import argparse
import re
import sys
import urllib.request


def strip_html(raw: str) -> str:
    raw = re.sub(r"<script[\s\S]*?</script>", " ", raw, flags=re.I)
    raw = re.sub(r"<style[\s\S]*?</style>", " ", raw, flags=re.I)
    raw = re.sub(r"<!--[\s\S]*?-->", " ", raw)
    raw = re.sub(r"<(script|style)[^>]*>", " ", raw, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", raw)
    for a, b in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                 ("&quot;", '"'), ("&#39;", "'"), ("&mdash;", "-"), ("&middot;", "-")):
        text = text.replace(a, b)
    text = re.sub(r"&#\d+;", " ", text)
    return text


def collapse(text: str, min_len: int) -> str:
    out, seen = [], set()
    for line in text.split("\n"):
        line = line.strip()
        if not line or len(line) < min_len:
            continue
        if line in seen:
            continue
        seen.add(line)
        out.append(line)
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url", nargs="?")
    ap.add_argument("--file")
    ap.add_argument("--out")
    ap.add_argument("--min-len", type=int, default=2)
    args = ap.parse_args()

    if args.file:
        with open(args.file, "r", encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
    elif args.url:
        req = urllib.request.Request(
            args.url, headers={"User-Agent": "Mozilla/5.0 (compatible; text-extract/1.0)"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    else:
        ap.error("need a url or --file")

    text = collapse(strip_html(raw), args.min_len)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"wrote {args.out} ({len(text)} chars)")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())

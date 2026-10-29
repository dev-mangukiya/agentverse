"""A small source ledger for review evidence; canonical URLs remove repetition."""

import re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode


def canonical_url(url):
    parts = urlsplit(url.rstrip(".,;)"))
    query = urlencode(
        [
            (k, v)
            for k, v in parse_qsl(parts.query)
            if not k.lower().startswith("utm_") and k not in ("fbclid", "gclid")
        ]
    )
    return urlunsplit(
        (
            parts.scheme.lower(),
            parts.netloc.lower(),
            parts.path.rstrip("/") or "/",
            query,
            "",
        )
    )


class SourceLedger:
    def __init__(self):
        self.sources = {}

    def add(self, tool, result):
        if tool not in ("web_search", "fetch_url", "search_github_repos"):
            return
        for url in re.findall(r'https?://[^\s<>\]"\)]+', result):
            key = canonical_url(url)
            if key not in self.sources and len(self.sources) < 30:
                self.sources[key] = {
                    "url": key,
                    "retrieval": "page" if tool == "fetch_url" else "snippet",
                }
            elif tool == "fetch_url" and key in self.sources:
                self.sources[key]["retrieval"] = "page"

    def text(self):
        return "\n".join(
            f"[{i}] {source['url']} ({source['retrieval']})"
            for i, source in enumerate(self.sources.values(), 1)
        )

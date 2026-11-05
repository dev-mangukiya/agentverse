"""A small source ledger for review evidence; canonical URLs remove repetition."""

import re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

# Skip Markdown code spans/fences. Leave existing links, images, reference
# definitions and array subscripts alone.
_CITATIONS = re.compile(
    r"(?P<fence>`+|~{3,}).*?(?P=fence)"
    r"|(?<![\w!\\\[\]])\[(?P<numbers>[1-9]\d?(?:[ \t]*,[ \t]*[1-9]\d?)*)\](?![\[(:])",
    re.DOTALL,
)


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
        # A page can mention many URLs. Only its own Source header identifies
        # what was fetched. Search tools supply a labelled URL for each hit.
        lines = result.splitlines()
        if tool == "fetch_url":
            lines = lines[:1]
        label = "URL:" if tool == "search_github_repos" else "Source:"
        for line in lines:
            url = line.strip()
            if url.startswith(label):
                url = url[len(label) :].strip()
            elif len(lines) != 1:
                continue
            if not re.fullmatch(r'https?://[^\s<>"]+', url):
                continue
            try:
                parts = urlsplit(url)
                if not parts.hostname or parts.username or parts.password:
                    continue
                key = canonical_url(url)
            except ValueError:
                continue
            if key not in self.sources and len(self.sources) < 30:
                self.sources[key] = {
                    "url": url,
                    "retrieval": "page" if tool == "fetch_url" else "snippet",
                }
            elif tool == "fetch_url" and key in self.sources:
                self.sources[key].update(url=url, retrieval="page")

    def text(self):
        return "\n".join(
            f"[{i}] {source['url']} ({source['retrieval']})"
            for i, source in enumerate(self.sources.values(), 1)
        )

    def link_citations(self, answer: str) -> str:
        """Resolve bare citation numbers against the sources from this turn."""
        if not self.sources:
            return answer
        urls = [source["url"] for source in self.sources.values()]
        defined = set(re.findall(r"(?m)^ {0,3}\[(\d+)\]:", answer))

        def render(match):
            if match["numbers"] is None:
                return match[0]
            labels = [label.strip() for label in match["numbers"].split(",")]
            if any(label in defined or int(label) > len(urls) for label in labels):
                return match[0]
            return ", ".join(f"[{label}](<{urls[int(label) - 1]}>)" for label in labels)

        return _CITATIONS.sub(render, answer)

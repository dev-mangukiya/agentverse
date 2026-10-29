"""Bounded HTTP fetching with public-IP DNS resolution on every connection."""

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit, urljoin
import aiohttp


class PublicResolver(aiohttp.abc.AbstractResolver):
    async def resolve(self, host, port=0, family=socket.AF_INET):
        infos = await asyncio.get_running_loop().getaddrinfo(
            host, port, type=socket.SOCK_STREAM
        )
        if not infos or any(
            not ipaddress.ip_address(item[4][0]).is_global for item in infos
        ):
            raise ValueError("Private or reserved network addresses are not allowed")
        return [
            {
                "hostname": host,
                "host": item[4][0],
                "port": port,
                "family": item[0],
                "proto": 0,
                "flags": socket.AI_NUMERICHOST,
            }
            for item in infos
        ]

    async def close(self):
        pass


def validate_url(url):
    parsed = urlsplit(url)
    if (
        parsed.scheme not in ("https", "http")
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 80, 443)
    ):
        raise ValueError("A public HTTP(S) URL on port 80 or 443 is required")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        if parsed.hostname.lower() == "localhost" or parsed.hostname.endswith(
            ".localhost"
        ):
            raise ValueError("Local URLs are not allowed")
    else:
        if not address.is_global:
            raise ValueError("Private or reserved network addresses are not allowed")
    return url


async def fetch_public(url):
    connector = aiohttp.TCPConnector(resolver=PublicResolver(), use_dns_cache=False)
    async with aiohttp.ClientSession(
        connector=connector,
        trust_env=False,
        auto_decompress=False,
        timeout=aiohttp.ClientTimeout(total=15),
        headers={"User-Agent": "AgentVerse/1.0", "Accept-Encoding": "identity"},
    ) as client:
        for _ in range(5):
            validate_url(url)
            async with client.get(url, allow_redirects=False) as response:
                if response.status in (301, 302, 303, 307, 308):
                    url = urljoin(url, response.headers.get("Location", ""))
                    continue
                response.raise_for_status()
                if response.headers.get("Content-Encoding", "identity").lower() not in (
                    "identity",
                    "",
                ):
                    raise ValueError(
                        "Compressed pages are not supported by this bounded fetcher"
                    )
                if response.content_type not in (
                    "text/html",
                    "text/plain",
                    "application/xhtml+xml",
                ):
                    raise ValueError("Only text and HTML pages are supported")
                data = bytearray()
                async for chunk in response.content.iter_chunked(16384):
                    data.extend(chunk)
                    if len(data) > 500_000:
                        raise ValueError("Page exceeds the 500 KB download limit")
                return url, data.decode("utf-8", errors="replace")
    raise ValueError("Too many redirects")

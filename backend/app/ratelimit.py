"""Per-IP cap on expensive cache misses.

Endpoints that generate-and-cache (audio, translations) are free on a hit but
call a paid API on a miss. The corpus being finite already bounds total spend
at "whole corpus, once per variant" — a cap just slows an abusive crawl to a
trickle. Each endpoint gets its own MissCap so budgets stay independent.
"""
import threading
import time

from fastapi import HTTPException, Request


class MissCap:
    def __init__(self, limit: int, window_seconds: float, what: str) -> None:
        self._limit = limit
        self._window = window_seconds
        self._what = what
        self._log: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, request: Request) -> None:
        """Record a miss for the requesting IP; 429 when over the cap."""
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
            request.client.host if request.client else "unknown"
        )
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._log.get(ip, []) if now - t < self._window]
            if len(recent) >= self._limit:
                raise HTTPException(
                    429, f"Too many {self._what} requests; try again later"
                )
            recent.append(now)
            self._log[ip] = recent

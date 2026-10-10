from __future__ import annotations

import math
import os
import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException

from sta.envs import STA_LOGIN_RATE_LIMIT_ATTEMPTS, STA_LOGIN_RATE_LIMIT_WINDOW_SECONDS


def _positive_int_from_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default

    error_message = f"{name} must be a positive integer"
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(error_message) from exc
    if value <= 0:
        raise RuntimeError(error_message)
    return value


class LoginRateLimiter:
    """A small, process-local sliding-window limiter for password checks."""

    def __init__(
        self,
        *,
        attempts: int,
        window_seconds: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        super().__init__()

        self.attempts = attempts
        self.window_seconds = window_seconds
        self._clock = clock
        self._attempts_by_key: dict[str, deque[float]] = {}
        self._next_cleanup_at = clock()
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls) -> LoginRateLimiter:
        return cls(
            attempts=_positive_int_from_env(STA_LOGIN_RATE_LIMIT_ATTEMPTS, 10),
            window_seconds=_positive_int_from_env(
                STA_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
                60,
            ),
        )

    def check(self, key: str) -> None:
        now = self._clock()
        cutoff = now - self.window_seconds
        retry_after: int | None = None

        with self._lock:
            # Keys contain attacker-influenced login identities. Evict every
            # expired bucket while holding the same lock used for mutation so
            # one-off usernames cannot accumulate for the process lifetime.
            if now >= self._next_cleanup_at:
                for existing_key, existing_attempts in list(
                    self._attempts_by_key.items(),
                ):
                    while existing_attempts and existing_attempts[0] <= cutoff:
                        existing_attempts.popleft()
                    if not existing_attempts:
                        self._attempts_by_key.pop(existing_key, None)
                # Amortize global eviction so ordinary checks remain O(1). The
                # sweep only reclaims memory for buckets whose key is never
                # checked again; it runs at most once per window, so it is not
                # what keeps an individual bucket's verdict accurate.
                self._next_cleanup_at = now + self.window_seconds

            attempts = self._attempts_by_key.setdefault(key, deque())

            # Drop this bucket's expired attempts before testing its size. The
            # sweep above cannot do it: between two sweeps an entry can age out
            # while the bucket still looks full, which would both reject a
            # request that should pass and derive `Retry-After` from an
            # already-expired attempt.
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()

            if len(attempts) >= self.attempts:
                retry_after = max(1, math.ceil(attempts[0] + self.window_seconds - now))
            else:
                attempts.append(now)

        if retry_after is not None:
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts_by_key.pop(key, None)

    def refund(self, key: str) -> None:
        """Undo one just-recorded check without clearing older failures.

        Call this immediately after a request succeeds or a subsequent limiter
        rejects it. Unlike ``reset``, it preserves the key's prior history.
        """
        with self._lock:
            attempts = self._attempts_by_key.get(key)
            if not attempts:
                return
            attempts.pop()
            if not attempts:
                self._attempts_by_key.pop(key, None)

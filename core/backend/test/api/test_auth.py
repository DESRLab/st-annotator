import math
from datetime import timedelta
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

import pytest

from sta.api.auth import _password_rate_limit_keys, _trusted_proxy_networks
from sta.api.rate_limit import LoginRateLimiter
from sta.api.root import build_api
from sta.domain import auth as domain
from sta.testing.config import TestApp as AppUnderTest

pytestmark = pytest.mark.in_memory_db


def _login_request(*, peer: str, forwarded_for: str = "", trusted_proxy_ips: str = "") -> Request:
    """A bare login request carrying the app state that `build_api` attaches.

    The limiter settings are resolved once at startup, so a request built here
    needs the same `app.state` an application would give it.
    """
    headers = [] if not forwarded_for else [(b"x-forwarded-for", forwarded_for.encode())]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/auth/login",
        "headers": headers,
        "client": (peer, 1234),
        "server": ("backend", 80),
        "scheme": "http",
        "query_string": b"",
        "app": SimpleNamespace(
            state=SimpleNamespace(
                trusted_proxy_networks=_trusted_proxy_networks(trusted_proxy_ips),
            ),
        ),
    }
    return Request(scope)


def test_refresh_uses_refresh_token_without_valid_access_token(test_app: AppUnderTest):
    client = TestClient(
        build_api(frontend_url="https://frontend.test"),
        base_url="https://backend.test",
    )
    login = client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    assert login.status_code == 200

    expired_access = domain.create_jwt_token(
        1,
        grant_type="access",
        expires_in=timedelta(seconds=-1),
    )
    refreshed = client.post(
        "/auth/refresh",
        headers={"Authorization": f"Bearer {expired_access}"},
    )

    assert refreshed.status_code == 200
    token = refreshed.json()["access_token"]
    assert domain.verify_jwt_token(token, grant_type="access") == 1


def test_refresh_rejects_refresh_token_for_missing_user(test_app: AppUnderTest):
    client = TestClient(
        build_api(frontend_url="https://frontend.test"),
        base_url="https://backend.test",
    )
    missing_user_token = domain.create_jwt_token(
        999_999,
        grant_type="refresh",
        expires_in=timedelta(minutes=5),
    )
    response = client.post(
        "/auth/refresh",
        headers={"Cookie": f"refresh_token={missing_user_token}"},
    )

    assert response.status_code == 401


def test_logout_revokes_access_and_refresh_tokens(test_app: AppUnderTest):
    client = TestClient(
        build_api(frontend_url="https://frontend.test"),
        base_url="https://backend.test",
    )
    login = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    assert login.status_code == 200
    access_token = login.json()["access_token"]
    refresh_token = login.json()["refresh_token"]

    logout = client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout.status_code == 200
    assert (
        client.get(
            "/auth/whoami",
            headers={"Authorization": f"Bearer {access_token}"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/refresh",
            headers={"Cookie": f"refresh_token={refresh_token}"},
        ).status_code
        == 401
    )


def test_password_change_revokes_existing_tokens(test_app: AppUnderTest):
    client = TestClient(
        build_api(frontend_url="https://frontend.test"),
        base_url="https://backend.test",
    )
    login = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    assert login.status_code == 200
    access_token = login.json()["access_token"]
    refresh_token = login.json()["refresh_token"]

    changed = client.patch(
        "/users/1",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"password": "new-admin-password", "current_password": "admin"},
    )
    assert changed.status_code == 200
    assert (
        client.get(
            "/auth/whoami",
            headers={"Authorization": f"Bearer {access_token}"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/refresh",
            headers={"Cookie": f"refresh_token={refresh_token}"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/login",
            data={"username": "admin", "password": "new-admin-password"},
        ).status_code
        == 200
    )


def test_multiple_logins_do_not_revoke_each_other(test_app: AppUnderTest):
    first_client = TestClient(
        build_api(frontend_url="https://frontend.test"),
        base_url="https://backend.test",
    )
    second_client = TestClient(
        build_api(frontend_url="https://frontend.test"),
        base_url="https://backend.test",
    )
    first_login = first_client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    second_login = second_client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    assert first_login.status_code == second_login.status_code == 200

    for token in (
        first_login.json()["access_token"],
        second_login.json()["access_token"],
    ):
        assert (
            first_client.get(
                "/auth/whoami",
                headers={"Authorization": f"Bearer {token}"},
            ).status_code
            == 200
        )


def test_login_rate_limit_reset_clears_attempts():
    limiter = LoginRateLimiter(attempts=1, window_seconds=60, clock=lambda: 0)

    limiter.check("client:user")
    limiter.reset("client:user")
    limiter.check("client:user")


def test_login_rate_limit_refund_removes_only_latest_attempt():
    limiter = LoginRateLimiter(attempts=2, window_seconds=60, clock=lambda: 0)

    limiter.check("client")
    limiter.check("client")
    limiter.refund("client")
    limiter.check("client")
    with pytest.raises(HTTPException):
        limiter.check("client")


def test_login_rate_limit_rejects_excess_attempts_with_retry_after():
    limiter = LoginRateLimiter(attempts=2, window_seconds=60, clock=lambda: 0)

    limiter.check("client:user")
    limiter.check("client:user")
    with pytest.raises(HTTPException) as exc_info:
        limiter.check("client:user")

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers == {"Retry-After": "60"}


def test_login_rate_limit_evicts_expired_identity_keys():
    now = 0
    limiter = LoginRateLimiter(attempts=2, window_seconds=60, clock=lambda: now)
    limiter.check("attacker-controlled-identity")

    now = 61
    limiter.check("current-identity")

    assert set(limiter._attempts_by_key) == {"current-identity"}


def test_login_rate_limit_uses_forwarded_client_only_from_trusted_proxy():
    # A publicly routable peer is one distinguishable client, so the address
    # bucket stays in force and only a trusted proxy may replace its address.
    untrusted = _login_request(peer="8.8.8.8", forwarded_for="198.51.100.8")
    direct_key, _ = _password_rate_limit_keys(untrusted, "Some User")
    assert direct_key == "login:ip:8.8.8.8"

    trusted = _login_request(
        peer="10.0.0.4",
        forwarded_for="198.51.100.8",
        trusted_proxy_ips="10.0.0.0/24",
    )
    forwarded_key, account_key = _password_rate_limit_keys(trusted, "Some User")
    assert forwarded_key == "login:ip:198.51.100.8"
    assert "some user" not in account_key


def test_login_ip_bucket_is_skipped_for_an_undistinguishable_client():
    # The shipped topology: every login arrives from the frontend server's own
    # address, so an address bucket there would be one bucket for all users.
    proxied = _login_request(peer="10.0.0.4")
    ip_key, account_key = _password_rate_limit_keys(proxied, "Some User")
    assert ip_key is None
    assert account_key.startswith("login:account:shared:")

    # Loopback and unparseable peer values identify no client either.
    assert _password_rate_limit_keys(_login_request(peer="127.0.0.1"), "u")[0] is None
    assert _password_rate_limit_keys(_login_request(peer="testclient"), "u")[0] is None

    # Distinct usernames keep getting distinct account buckets, which is what
    # still limits guesses once the address bucket is skipped.
    keys = {
        _password_rate_limit_keys(_login_request(peer="10.0.0.4"), username)[1]
        for username in ("Some User", "other-user")
    }
    assert len(keys) == 2


def test_shared_hop_detection_is_not_disabled_by_configuration():
    # Configuring one trusted network must not declare every address
    # distinguishable. A private peer outside that network still fronts many
    # clients -- a second frontend, a container gateway -- and bucketing by it
    # would lock the platform out of logging in.
    untrusted_private = _password_rate_limit_keys(
        _login_request(peer="10.0.0.4", trusted_proxy_ips="203.0.113.7/32"),
        "Some User",
    )
    assert untrusted_private[0] is None
    assert untrusted_private[1].startswith("login:account:shared:")

    # A peer value that is not an address identifies no client either, however
    # much else is configured.
    assert (
        _password_rate_limit_keys(
            _login_request(peer="testclient", trusted_proxy_ips="203.0.113.7/32"), "u"
        )[0]
        is None
    )


def test_trusted_proxy_without_a_forwarded_address_is_treated_as_shared():
    # Trusting a proxy authorises reading its forwarding header; it does not
    # conjure a client address. With none supplied, everyone behind that proxy
    # collapses onto the proxy's own address, which is a shared bucket.
    no_header = _password_rate_limit_keys(
        _login_request(peer="10.0.0.4", trusted_proxy_ips="10.0.0.0/24"), "Some User"
    )
    assert no_header[0] is None

    malformed = _password_rate_limit_keys(
        _login_request(
            peer="10.0.0.4",
            forwarded_for="not-an-address",
            trusted_proxy_ips="10.0.0.0/24",
        ),
        "Some User",
    )
    assert malformed[0] is None

    # The same proxy *with* a valid address is what distinguishes clients, so
    # the bucket stays in force there.
    assert (
        _password_rate_limit_keys(
            _login_request(
                peer="10.0.0.4",
                forwarded_for="198.51.100.8",
                trusted_proxy_ips="10.0.0.0/24",
            ),
            "Some User",
        )[0]
        == "login:ip:198.51.100.8"
    )


def test_login_rate_limit_prunes_the_checked_bucket_before_rejecting():
    now = 0.0
    limiter = LoginRateLimiter(attempts=3, window_seconds=60, clock=lambda: now)

    # Arm the global sweep on an unrelated key, so its next run is scheduled for
    # t=120 - after the oldest victim attempt below has already expired.
    limiter.check("bystander")

    now = 1.0
    limiter.check("victim")
    now = 30.0
    limiter.check("victim")
    now = 58.0
    limiter.check("victim")

    now = 60.0
    # The sweep runs and keeps all three victim attempts: none has expired yet.
    limiter.check("bystander")

    # At t=61 the t=1 attempt is out of the window, leaving two live attempts
    # under a limit of three. Judging the unpruned bucket instead rejects the
    # request with a Retry-After derived from an already-expired attempt.
    now = 61.0
    limiter.check("victim")


def test_login_rate_limit_retry_after_counts_from_the_oldest_live_attempt():
    now = 0.0
    limiter = LoginRateLimiter(attempts=3, window_seconds=60, clock=lambda: now)

    limiter.check("client")
    now = 10.0
    limiter.check("client")
    now = 20.0
    limiter.check("client")

    now = 55.0
    with pytest.raises(HTTPException) as exc_info:
        limiter.check("client")

    assert exc_info.value.status_code == 429
    oldest_live = 0.0
    retry_after = int(exc_info.value.headers["Retry-After"])
    assert retry_after == math.ceil(oldest_live + 60 - now)
    assert retry_after > 1


def test_login_ip_rate_limit_rejects_password_spraying(test_app: AppUnderTest):
    app = build_api(frontend_url="https://frontend.test")
    app.state.login_rate_limiter = LoginRateLimiter(attempts=2, window_seconds=60)
    # A publicly routable peer identifies one client, so the address bucket that
    # bounds spraying across usernames is in force.
    client = TestClient(app, base_url="https://backend.test", client=("8.8.8.8", 50000))

    for username in ("spray-one", "spray-two"):
        response = client.post(
            "/auth/login",
            data={"username": username, "password": "wrong"},
        )
        assert response.status_code == 400

    blocked = client.post(
        "/auth/login",
        data={"username": "spray-three", "password": "wrong"},
    )
    assert blocked.status_code == 429


def test_login_still_succeeds_when_the_address_bucket_would_be_shared(test_app: AppUnderTest):
    # Regression: with the default full-stack topology the backend's peer is the
    # frontend server for every login, so an address bucket there is one bucket
    # shared by all users. A handful of failed guesses for arbitrary usernames
    # used to fill it and return 429 for everyone, admins included.
    app = build_api(frontend_url="https://frontend.test")
    app.state.login_rate_limiter = LoginRateLimiter(attempts=2, window_seconds=60)
    client = TestClient(app, base_url="https://backend.test")

    for username in ("shared-one", "shared-two", "shared-three"):
        response = client.post(
            "/auth/login",
            data={"username": username, "password": "wrong"},
        )
        assert response.status_code == 400

    allowed = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    assert allowed.status_code == 200


def test_login_account_bucket_still_limits_an_undistinguishable_client(test_app: AppUnderTest):
    app = build_api(frontend_url="https://frontend.test")
    app.state.login_rate_limiter = LoginRateLimiter(attempts=2, window_seconds=60)
    client = TestClient(app, base_url="https://backend.test")

    for _ in range(2):
        response = client.post("/auth/login", data={"username": "admin", "password": "wrong"})
        assert response.status_code == 400

    blocked = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    assert blocked.status_code == 429


def test_check_password_is_rate_limited(test_app: AppUnderTest):
    app = build_api(frontend_url="https://frontend.test")
    app.state.login_rate_limiter = LoginRateLimiter(attempts=2, window_seconds=60)
    client = TestClient(app, base_url="https://backend.test")
    login = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    for _ in range(2):
        response = client.post(
            "/auth/check_password",
            headers=headers,
            json={"password": "wrong"},
        )
        assert response.status_code == 400

    blocked = client.post(
        "/auth/check_password",
        headers=headers,
        json={"password": "wrong"},
    )
    assert blocked.status_code == 429

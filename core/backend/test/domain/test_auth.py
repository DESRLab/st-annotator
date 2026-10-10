from datetime import datetime, timedelta
from pathlib import Path

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from sqlmodel import Session

import pytest

from sta.common.database import InMemoryDatabaseConfig
from sta.config import AppConfig
from sta.domain import auth as domain
from sta.domain.users import create_user
from sta.entrypoints import test_app_ctx as make_test_app_ctx
from sta.models.user import UserCreate, UserPublic
from sta.session import session_ctx
from sta.testing.keys import generate_signing_key_pem

KEY_ENVIRONMENTS = ("STA_JWT_PRIVATE_KEY_PATH", "STA_JWT_SECRET", "STA_SESSION_SECRET")
"""Names key resolution reads or must ignore, cleared before every key test.

The removed `STA_JWT_SECRET` belongs here because a deployment that has not migrated
must fail on the new name, and because the ambient environment can carry either value.
"""


def _clear_key_source(monkeypatch, signing_key_override: str | None = None) -> None:
    """Leave key resolution with the given option and nothing else to read.

    The option is recorded through `monkeypatch` because it is a process global that
    outranks the environment: a test that set it must not decide the key for the tests
    that follow, which is also what keeps an earlier `sta serve` invocation, run in this
    same interpreter, from leaking in.
    """
    for name in KEY_ENVIRONMENTS:
        monkeypatch.delenv(name, raising=False)

    monkeypatch.setattr(domain, "_signing_key_override", signing_key_override)


def _write_key(tmp_path: Path, private_pem: str, name: str = "jwt-signing.key") -> str:
    path = tmp_path / name
    path.write_text(private_pem)

    return str(path)


def _test_login_credentials(
    session: Session,
    root_user: UserPublic,
    root_username: str,
    root_password: str,
):
    other_username = root_username + "_other"
    other_password = root_password + "_other"
    other_record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username=other_username,
            password=other_password,
            roles=set(),
        ),
    )

    record = domain.auth_user(session, username=root_username, password=root_password)
    assert UserPublic.model_validate(record) == root_user

    with pytest.raises(type(domain.INVALID_LOGIN)) as exc_info:
        domain.auth_user(session, username="no_such_user", password=root_password)

    assert exc_info.value == domain.INVALID_LOGIN

    with pytest.raises(type(domain.INVALID_LOGIN)) as exc_info:
        domain.auth_user(session, username=other_username, password=root_password)

    assert exc_info.value == domain.INVALID_LOGIN

    with pytest.raises(type(domain.INVALID_LOGIN)) as exc_info:
        domain.auth_user(session, username=root_username, password=other_password)

    assert exc_info.value == domain.INVALID_LOGIN

    other_user = domain.auth_user(session, username=other_username, password=other_password)
    assert other_user == UserPublic.model_validate(other_record)

    assert domain.get_user(session, user_id=root_user.id) == root_user
    assert domain.get_user(session, user_id=root_user.id + 10_000) is None


@pytest.mark.parametrize(
    ("username", "password"),
    [
        ("admin", "admin"),
        ("root_user", "S3cure-pass!"),
        ("test.user@host", "p@ss.w0rd"),
    ],
)
def test_login_credentials(username: str, password: str):
    # Auth needs no PostGIS features, so it runs on the in-memory SQLite
    # backend instead of recreating a PostGIS database per test.
    app_config = AppConfig.test(db_config=InMemoryDatabaseConfig())
    with make_test_app_ctx(app_config, root_username=username, root_password=password) as user:
        with session_ctx(app_config) as session:
            _test_login_credentials(session, user, username, password)


def test_missing_user_still_verifies_against_dummy_hash(session: Session, monkeypatch):
    verified_hashes: list[str] = []

    def fake_verify_password(password, hashed_password):
        verified_hashes.append(hashed_password)
        return False

    monkeypatch.setattr(domain, "verify_password", fake_verify_password)

    with pytest.raises(type(domain.INVALID_LOGIN)):
        domain.auth_user(session, username="missing-user", password="guess")

    assert verified_hashes == [domain.DUMMY_PASSWORD_HASH]


def test_require_configured_signing_key_needs_a_key_file(monkeypatch, tmp_path):
    _clear_key_source(monkeypatch)
    with pytest.raises(RuntimeError, match="STA_JWT_PRIVATE_KEY_PATH"):
        domain.require_configured_signing_key()

    monkeypatch.setenv("STA_JWT_PRIVATE_KEY_PATH", _write_key(tmp_path, generate_signing_key_pem()))
    domain.require_configured_signing_key()


def test_cookie_secret_no_longer_signs_api_tokens(monkeypatch):
    # The frontend signs its `__session` cookie with STA_SESSION_SECRET. Accepting that
    # value here collapsed the two trust domains: one leaked secret would have minted
    # access tokens directly against the backend instead of only forging sessions.
    _clear_key_source(monkeypatch)
    monkeypatch.setenv("STA_SESSION_SECRET", "cookie-signing-secret")

    with pytest.raises(RuntimeError, match="STA_JWT_PRIVATE_KEY_PATH"):
        domain.require_configured_signing_key()


def test_removed_jwt_secret_is_not_read(monkeypatch):
    # An un-migrated deployment must fail on the new name rather than accept the old
    # value and run on the ephemeral keypair without saying so.
    _clear_key_source(monkeypatch)
    monkeypatch.setenv("STA_JWT_SECRET", "an-old-style-shared-secret")

    with pytest.raises(RuntimeError, match="STA_JWT_PRIVATE_KEY_PATH"):
        domain.require_configured_signing_key()


@pytest.mark.parametrize(
    ("pem_name", "expected"),
    [
        ("absent", "could not be read"),
        ("public", "private key PEM"),
        ("secp384r1", "P-256"),
    ],
)
def test_require_configured_signing_key_rejects_an_unusable_key(
    monkeypatch, tmp_path, pem_name: str, expected: str
):
    _clear_key_source(monkeypatch)
    if pem_name == "absent":
        path = str(tmp_path / "absent.key")
    elif pem_name == "public":
        # Handing over the verification half is the likeliest operator mistake, and
        # `ES256` cannot sign with it.
        path = _write_key(tmp_path, domain.verification_key(), "public.key")
    else:
        path = _write_key(tmp_path, generate_signing_key_pem(ec.SECP384R1()), "other-curve.key")
    monkeypatch.setenv("STA_JWT_PRIVATE_KEY_PATH", path)

    with pytest.raises(RuntimeError, match=expected):
        domain.require_configured_signing_key()


def test_relative_key_path_anchors_at_its_env_file(monkeypatch, tmp_path):
    # A key kept beside the configuration resolves as `FILESYSTEM_ROOT` does. The working
    # directory holds no key at all, so only the `.env` anchor can make this resolve.
    _clear_key_source(monkeypatch)
    (tmp_path / ".env").write_text("STA_JWT_PRIVATE_KEY_PATH=jwt-signing.key\n")
    _write_key(tmp_path, generate_signing_key_pem())
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    monkeypatch.setenv("STA_JWT_PRIVATE_KEY_PATH", "jwt-signing.key")

    domain.require_configured_signing_key()

    token = domain.create_jwt_token(42, grant_type="access", expires_in=timedelta(minutes=5))
    assert domain.verify_jwt_token(token, grant_type="access") == 42


def test_option_path_follows_the_working_directory(monkeypatch, tmp_path):
    # The `.env` anchor sits one level above, but the key lies beside the command. An
    # option is a shell argument, so it must not be redirected to the other directory.
    _clear_key_source(monkeypatch, "jwt-signing.key")
    (tmp_path / ".env").write_text("STA_JWT_PRIVATE_KEY_PATH=jwt-signing.key\n")
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    _write_key(elsewhere, generate_signing_key_pem())
    monkeypatch.chdir(elsewhere)

    domain.require_configured_signing_key()


def test_signing_key_reflects_key_configured_after_import(monkeypatch, tmp_path):
    # `sta serve` imports this module long before AppConfigArgs.as_config() loads
    # the process `.env`, so a key that lives only there must still be the one tokens
    # are signed with. A key resolved at import would leave the signer on the ephemeral
    # fallback while the startup guard reads the loaded environment.
    _clear_key_source(monkeypatch)
    monkeypatch.setenv("STA_JWT_PRIVATE_KEY_PATH", _write_key(tmp_path, generate_signing_key_pem()))

    domain.require_configured_signing_key()

    token = domain.create_jwt_token(42, grant_type="access", expires_in=timedelta(minutes=5))

    assert domain.JWT_ALGORITHM == "ES256"
    assert jwt.decode(token, domain.verification_key(), algorithms=["ES256"])["sub"] == "42"
    assert domain.verify_jwt_token(token, grant_type="access") == 42


def test_verification_key_carries_no_signing_power(monkeypatch, tmp_path):
    _clear_key_source(monkeypatch)
    monkeypatch.setenv("STA_JWT_PRIVATE_KEY_PATH", _write_key(tmp_path, generate_signing_key_pem()))

    public_pem = domain.verification_key()

    assert public_pem.startswith("-----BEGIN PUBLIC KEY-----")
    assert "PRIVATE KEY" not in public_pem
    assert public_pem != domain.signing_key()

    token = domain.create_jwt_token(42, grant_type="access", expires_in=timedelta(minutes=5))
    assert jwt.decode(token, public_pem, algorithms=["ES256"])["sub"] == "42"


def test_verifying_key_follows_a_repointed_source(monkeypatch, tmp_path):
    # The keypair is cached per resolved source, so a deployment that changes which
    # file the environment names starts verifying with that file instead of keeping
    # the key the process happened to load first.
    _clear_key_source(monkeypatch)
    monkeypatch.setenv(
        "STA_JWT_PRIVATE_KEY_PATH", _write_key(tmp_path, generate_signing_key_pem(), "first.key")
    )
    token = domain.create_jwt_token(42, grant_type="access", expires_in=timedelta(minutes=5))

    monkeypatch.setenv(
        "STA_JWT_PRIVATE_KEY_PATH",
        _write_key(tmp_path, generate_signing_key_pem(), "second.key"),
    )

    with pytest.raises(type(domain.INVALID_CREDENTIALS)):
        domain.verify_jwt_token(token, grant_type="access")


def test_configured_option_overrides_the_environment(monkeypatch, tmp_path):
    _clear_key_source(monkeypatch)
    monkeypatch.setenv(
        "STA_JWT_PRIVATE_KEY_PATH", _write_key(tmp_path, generate_signing_key_pem(), "env.key")
    )
    env_token = domain.create_jwt_token(42, grant_type="access", expires_in=timedelta(minutes=5))

    domain.configure_signing_key(_write_key(tmp_path, generate_signing_key_pem(), "flag.key"))

    flag_token = domain.create_jwt_token(7, grant_type="access", expires_in=timedelta(minutes=5))
    assert domain.verify_jwt_token(flag_token, grant_type="access") == 7
    with pytest.raises(type(domain.INVALID_CREDENTIALS)):
        domain.verify_jwt_token(env_token, grant_type="access")


@pytest.mark.parametrize("grant_type", ["access", "refresh"])
def test_jwt_token_round_trip(grant_type: domain.GrantType):
    token = domain.create_jwt_token(42, grant_type=grant_type, expires_in=timedelta(minutes=5))

    assert domain.verify_jwt_token(token, grant_type=grant_type) == 42


@pytest.mark.parametrize("token", ["not-a-jwt", "", "a.b.c"])
def test_verify_jwt_token_rejects_invalid_tokens(token: str):
    with pytest.raises(type(domain.INVALID_CREDENTIALS)) as exc_info:
        domain.verify_jwt_token(token, grant_type="access")

    assert exc_info.value == domain.INVALID_CREDENTIALS


def test_verify_jwt_token_rejects_expired_token():
    token = domain.create_jwt_token(42, grant_type="access", expires_in=timedelta(seconds=-1))

    with pytest.raises(type(domain.INVALID_CREDENTIALS)) as exc_info:
        domain.verify_jwt_token(token, grant_type="access")

    assert exc_info.value == domain.INVALID_CREDENTIALS


def test_verify_jwt_token_rejects_token_without_sub():
    token = jwt.encode(
        {
            "grant_type": "access",
            "exp": datetime.now().astimezone() + timedelta(minutes=5),
        },
        domain.signing_key(),
        algorithm=domain.JWT_ALGORITHM,
    )

    with pytest.raises(type(domain.INVALID_CREDENTIALS)) as exc_info:
        domain.verify_jwt_token(token, grant_type="access")

    assert exc_info.value == domain.INVALID_CREDENTIALS


def test_verify_jwt_token_rejects_mismatched_grant_type():
    token = domain.create_jwt_token(42, grant_type="access", expires_in=timedelta(minutes=5))

    with pytest.raises(type(domain.INVALID_CREDENTIALS)) as exc_info:
        domain.verify_jwt_token(token, grant_type="refresh")

    assert exc_info.value == domain.INVALID_CREDENTIALS


def test_verify_jwt_token_rejects_non_integer_subject():
    token = jwt.encode(
        {
            "sub": "not-an-integer",
            "grant_type": "access",
            "exp": datetime.now().astimezone() + timedelta(minutes=5),
        },
        domain.signing_key(),
        algorithm=domain.JWT_ALGORITHM,
    )

    with pytest.raises(type(domain.INVALID_CREDENTIALS)) as exc_info:
        domain.verify_jwt_token(token, grant_type="access")

    assert exc_info.value == domain.INVALID_CREDENTIALS

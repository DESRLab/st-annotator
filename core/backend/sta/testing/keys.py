"""Test-only helpers for the token-signing key."""

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
)

import pytest

from sta.domain import auth
from sta.envs import STA_JWT_PRIVATE_KEY_PATH

__all__ = ["generate_signing_key_pem", "isolated_signing_key"]


@pytest.fixture(autouse=True)
def isolated_signing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep every test off the signing key this machine happens to configure.

    The configuration loaders read `.env` into the process environment, so a
    developer's or CI's `STA_JWT_PRIVATE_KEY_PATH` — and any `--jwt-private-key` handled
    by an in-process `sta serve` — would otherwise decide which key signs and verifies,
    making a run depend on files outside the repository. Tests then land on the
    ephemeral keypair, which is stable within the process and needs no configuration.
    A test that wants a configured key sets it after this fixture.
    """
    monkeypatch.delenv(STA_JWT_PRIVATE_KEY_PATH, raising=False)
    monkeypatch.setattr(auth, "_signing_key_override", None)


def generate_signing_key_pem(curve: ec.EllipticCurve | None = None) -> str:
    """PEM of a throwaway EC private key, for tests that point the signer at a file.

    The programmatic equivalent of the documented
    `openssl ecparam -name prime256v1 -genkey -noout -out <jwt_path>`; pass another
    curve to obtain a key `ES256` must reject. The result signs nothing outside the
    tests that write it.
    """
    private_key = ec.generate_private_key(ec.SECP256R1() if curve is None else curve)

    return private_key.private_bytes(
        encoding=Encoding.PEM,
        format=PrivateFormat.PKCS8,
        encryption_algorithm=NoEncryption(),
    ).decode("ascii")

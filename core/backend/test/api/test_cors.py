import pytest

from sta.api.cors import DEFAULT_FRONTEND_URL, resolve_frontend_url


def test_resolve_frontend_url_prefers_explicit_origin(monkeypatch):
    monkeypatch.setenv("STA_FRONTEND_URL", "http://env.example.com")

    assert resolve_frontend_url("http://localhost:5174") == "http://localhost:5174"


def test_resolve_frontend_url_reads_env(monkeypatch):
    monkeypatch.setenv("STA_FRONTEND_URL", " http://env.example.com ")

    assert resolve_frontend_url() == "http://env.example.com"


def test_resolve_frontend_url_rejects_multiple_env_origins(monkeypatch):
    monkeypatch.setenv("STA_FRONTEND_URL", "http://a.example.com,http://b.example.com")

    with pytest.raises(ValueError, match="single origin"):
        resolve_frontend_url()


def test_resolve_frontend_url_rejects_multiple_explicit_origins(monkeypatch):
    monkeypatch.delenv("STA_FRONTEND_URL", raising=False)

    with pytest.raises(ValueError, match=r"--frontend-url accepts a single origin"):
        resolve_frontend_url("http://a.example.com,http://b.example.com")


def test_resolve_frontend_url_strips_explicit_origin(monkeypatch):
    monkeypatch.delenv("STA_FRONTEND_URL", raising=False)

    assert resolve_frontend_url("  http://a.example.com  ") == "http://a.example.com"


def test_resolve_frontend_url_ignores_blank_env(monkeypatch):
    monkeypatch.setenv("STA_FRONTEND_URL", "   ")

    assert resolve_frontend_url() == DEFAULT_FRONTEND_URL


def test_resolve_frontend_url_defaults_without_env(monkeypatch):
    monkeypatch.delenv("STA_FRONTEND_URL", raising=False)

    assert resolve_frontend_url() == DEFAULT_FRONTEND_URL == "http://localhost:5173"

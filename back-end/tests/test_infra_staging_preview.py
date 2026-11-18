"""Modo preview da staging (CloudFront) no deploy, sem AWS nem Docker obrigatórios."""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from scripts.infra import deploy_staging as deploy

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "infra/aws/staging"
PREVIEW_URL = "https://d319kj20trzdym.cloudfront.net"
SECRET = "A1b2C3d4" * 6


@pytest.fixture
def config():
    return {
        "account_id": "123456789012",
        "sha": "a" * 40,
        "queue_url": "https://sqs.us-east-2.amazonaws.com/123456789012/vintex-ai-staging",
        "media_bucket": "vintex-media-staging-test",
        "public_base_url": "http://localhost:8080",
        "runtime_dir": str(RUNTIME),
    }


@pytest.fixture
def parameters():
    return {
        "db_password": "p" * 20,
        "jwt_secret": "j" * 40,
        "llm_encryption_key": "a" * 64,
        "llm_admin_email": "admin@example.test",
        "llm_admin_password": "not-a-real-password",
        "llm_api_key": "synthetic-gateway-key",
    }


def env_file(path: Path) -> dict[str, str]:
    return dict(line.split("=", 1) for line in path.read_text().splitlines())


@pytest.mark.parametrize(
    "url,valid",
    [
        (PREVIEW_URL, True),
        ("http://localhost:8080", True),
        ("http://d319kj20trzdym.cloudfront.net", False),
        ("https://d319kj20trzdym.cloudfront.net/", False),
        ("https://evil.example.test", False),
        ("https://abc.cloudfront.net", False),
    ],
)
def test_public_url_accepts_only_tunnel_or_cloudfront(config, url, valid):
    config["public_base_url"] = url
    if valid:
        deploy.validate_config(config)
    else:
        with pytest.raises(ValueError):
            deploy.validate_config(config)


def test_api_calls_gateway_and_worker_only_through_its_own_provider(
    tmp_path, config, parameters
):
    deploy.render_secrets(parameters, tmp_path, config)
    api = env_file(tmp_path / "api.env")
    worker = env_file(tmp_path / "worker.env")
    assert api["AI_PROVIDER"] == "freellmapi"
    assert worker["AI_PROVIDER"] == "unavailable"
    assert worker["AI_WORKER_PROVIDER"] == "freellmapi"
    assert "AI_WORKER_PROVIDER" not in api
    for env in (api, worker):
        assert env["FREELLMAPI_BASE_URL"] == "http://freellmapi:3001/v1"
        assert env["FREELLMAPI_API_KEY"] == "synthetic-gateway-key"
        assert env["FREELLMAPI_MODEL"] == "auto"


def test_tunnel_mode_keeps_loopback_and_release_nginx(tmp_path, config, parameters):
    proxy = deploy.render_proxy(parameters, tmp_path, config)
    assert proxy == {
        "nginx_conf": str(RUNTIME.resolve() / "nginx.conf"),
        "proxy_bind": "127.0.0.1",
    }
    assert not list(tmp_path.iterdir())


def test_preview_renders_secret_outside_release(tmp_path, config, parameters):
    config["public_base_url"] = PREVIEW_URL
    proxy = deploy.render_proxy(
        {**parameters, "origin_verify": SECRET}, tmp_path, config
    )
    rendered = tmp_path / "nginx.conf"
    assert proxy == {"nginx_conf": str(rendered), "proxy_bind": "0.0.0.0"}
    text = rendered.read_text()
    assert deploy.ORIGIN_PLACEHOLDER not in text
    assert text.count(f'"{SECRET}"') == 3
    assert rendered.stat().st_mode & 0o777 == 0o600
    assert SECRET not in (RUNTIME / "nginx.preview.conf").read_text()


@pytest.mark.parametrize(
    "secret", [None, "", "curto", "a" * 31, "x" * 31 + '"', "a" * 129]
)
def test_preview_without_valid_origin_secret_writes_nothing(
    tmp_path, config, parameters, secret
):
    config["public_base_url"] = PREVIEW_URL
    if secret is not None:
        parameters["origin_verify"] = secret
    with pytest.raises(ValueError, match="origin_verify"):
        deploy.render_proxy(parameters, tmp_path, config)
    assert not list(tmp_path.iterdir())


def test_preview_template_guards_every_public_route():
    text = (RUNTIME / "nginx.preview.conf").read_text()
    blocks = dict(re.findall(r"location ([^{]+?) \{\n(.*?)\n    \}", text, flags=re.S))
    check = (
        f'if ($http_x_origin_verify != "{deploy.ORIGIN_PLACEHOLDER}") {{ return 403; }}'
    )
    assert check not in blocks["= /health"]
    assert "return 403" in blocks["~ ^/api/auth/register/*$"]
    for route in ("~ ^/api(?:/|$)", "= /index.html", "/"):
        assert check in blocks[route]
    assert "real_ip_header X-Forwarded-For;" in text
    assert "proxy_set_header X-Forwarded-Proto https;" in text
    tunnel = (RUNTIME / "nginx.conf").read_text()
    assert "x_origin_verify" not in tunnel and "real_ip_header" not in tunnel


def compose_env(release: dict[str, str], monkeypatch) -> dict[str, str]:
    seen: dict[str, str] = {}

    def run(args, *, env=None):
        seen.update(env)
        return ""

    monkeypatch.setattr(deploy, "run", run)
    deploy.Deployment.compose(release, "config", "--quiet")
    return seen


def base_release(tmp_path: Path) -> dict[str, str]:
    return {
        "sha": "b" * 40,
        "backend_image": "registry/vintex-backend:" + "b" * 40,
        "llm_image": "registry/freellmapi@sha256:fake",
        "runtime_dir": str(RUNTIME),
        "frontend_dir": str(tmp_path),
        "secrets_dir": str(tmp_path),
    }


def test_release_recorded_before_preview_fields_rolls_back_in_tunnel_mode(
    tmp_path, monkeypatch
):
    env = compose_env(base_release(tmp_path), monkeypatch)
    assert env["NGINX_CONF"] == str(RUNTIME / "nginx.conf")
    assert env["PROXY_BIND"] == "127.0.0.1"


def test_rollback_reuses_the_proxy_mode_recorded_with_the_release(
    tmp_path, monkeypatch
):
    release = {
        **base_release(tmp_path),
        "nginx_conf": str(tmp_path / "nginx.conf"),
        "proxy_bind": "0.0.0.0",
    }
    env = compose_env(release, monkeypatch)
    assert env["NGINX_CONF"] == release["nginx_conf"]
    assert env["PROXY_BIND"] == "0.0.0.0"


def test_bootstrap_records_preview_proxy_in_release(
    tmp_path, monkeypatch, config, parameters
):
    from types import SimpleNamespace
    from unittest.mock import Mock

    frontend = tmp_path / "frontend"
    frontend.mkdir()
    (frontend / "index.html").write_text("synthetic frontend")
    config.update({"public_base_url": PREVIEW_URL, "frontend_dir": str(frontend)})
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(config))
    monkeypatch.setattr(
        "sys.argv",
        ["deploy", "--config", str(config_path), "--state", str(tmp_path / "state")],
    )
    monkeypatch.setattr(deploy.os, "geteuid", lambda: 0)
    monkeypatch.setattr(deploy.os, "uname", lambda: SimpleNamespace(machine="aarch64"))
    monkeypatch.setattr(
        deploy,
        "run",
        lambda args: "1.44" if args[:2] == ["docker", "version"] else "2.30.0",
    )
    session = Mock()
    session.get_credentials.return_value = SimpleNamespace(method="iam-role")
    session.client.return_value.get_caller_identity.return_value = {
        "Account": config["account_id"]
    }
    monkeypatch.setattr(deploy.boto3, "Session", lambda **k: session)
    monkeypatch.setattr(
        deploy, "read_parameters", lambda _: {**parameters, "origin_verify": SECRET}
    )
    monkeypatch.setattr(deploy, "login_ecr", Mock())
    perform = Mock()
    monkeypatch.setattr(deploy.Deployment, "deploy", perform)
    deploy.main()
    release = perform.call_args.args[0]
    assert release["proxy_bind"] == "0.0.0.0"
    assert Path(release["nginx_conf"]).parent == Path(release["secrets_dir"])
    assert SECRET in Path(release["nginx_conf"]).read_text()


@pytest.mark.skipif(
    shutil.which("docker") is None, reason="Docker Compose CLI required"
)
@pytest.mark.parametrize("preview", [False, True])
def test_rendered_compose_in_both_proxy_modes(tmp_path, preview):
    for name in ("api", "worker", "db", "llm"):
        (tmp_path / f"{name}.env").write_text("SYNTHETIC_TEST=1\n")
    env = dict(os.environ)
    env.update(
        {
            "RELEASE_SHA": "a" * 40,
            "BACKEND_IMAGE": "registry/vintex-backend:" + "a" * 40,
            "FREELLMAPI_IMAGE": "registry/freellmapi@sha256:" + "b" * 64,
            "SECRETS_DIR": str(tmp_path),
            "FRONTEND_DIR": str(tmp_path),
        }
    )
    if preview:
        (tmp_path / "nginx.conf").write_text("# rendered\n")
        env.update(
            {"NGINX_CONF": str(tmp_path / "nginx.conf"), "PROXY_BIND": "0.0.0.0"}
        )
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            "/dev/null",
            "-f",
            str(RUNTIME / "compose.yml"),
            "config",
            "--format",
            "json",
        ],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    proxy = json.loads(result.stdout)["services"]["proxy"]
    assert [port["host_ip"] for port in proxy["ports"]] == [
        "0.0.0.0" if preview else "127.0.0.1"
    ]
    mount = next(v for v in proxy["volumes"] if v["target"].endswith("default.conf"))
    expected = tmp_path / "nginx.conf" if preview else RUNTIME / "nginx.conf"
    assert Path(mount["source"]) == expected
    assert mount["read_only"] is True

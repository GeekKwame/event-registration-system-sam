"""Origin-access checks, admin session tokens, and shared input validation."""
import base64
import hashlib
import hmac
import json
import os
import re
import time

from utils.response import error_response

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ADMIN_TOKEN_TTL_SECONDS = 8 * 60 * 60

_admin_config = None


def require_cloudfront_origin(event):
    """Reject calls that did not come through CloudFront.

    When ORIGIN_VERIFY_SECRET is unset (unit tests / sam local without the
    stack secret), the check is skipped so handlers remain testable.
    """
    expected = os.environ.get("ORIGIN_VERIFY_SECRET") or ""
    if not expected:
        return None

    headers = event.get("headers") or {}
    incoming = ""
    for key, value in headers.items():
        if str(key).lower() == "x-origin-verify":
            incoming = value or ""
            break

    if not incoming or not hmac.compare_digest(str(incoming), str(expected)):
        return error_response(403, "Forbidden")
    return None


def is_valid_email(value: str) -> bool:
    return bool(value) and bool(EMAIL_REGEX.match(value)) and len(value) <= 254


def _header(event, name):
    headers = event.get("headers") or {}
    for key, value in headers.items():
        if str(key).lower() == name.lower():
            return value or ""
    return ""


def get_admin_config():
    """Password + HMAC key. Secrets Manager in prod; env vars in tests."""
    global _admin_config
    if _admin_config:
        return _admin_config

    password = os.environ.get("ADMIN_PASSWORD") or ""
    token_key = os.environ.get("ADMIN_TOKEN_KEY") or ""
    secret_arn = os.environ.get("ADMIN_SECRET_ARN") or ""

    if secret_arn:
        try:
            import boto3
            raw = boto3.client("secretsmanager").get_secret_value(SecretId=secret_arn).get("SecretString") or ""
            parsed = json.loads(raw) if raw.startswith("{") else {}
            password = parsed.get("password") or password
            token_key = parsed.get("tokenKey") or token_key
        except Exception as exc:
            print(f"Could not read admin secret: {exc}")

    if password and token_key:
        _admin_config = {"password": password, "tokenKey": token_key}
    return _admin_config or {}


def reset_admin_config_cache():
    global _admin_config
    _admin_config = None


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def issue_admin_token(ttl_seconds=ADMIN_TOKEN_TTL_SECONDS):
    config = get_admin_config()
    token_key = config.get("tokenKey") or ""
    if not token_key:
        return ""
    expires = int(time.time()) + int(ttl_seconds)
    payload = f"admin|{expires}".encode("utf-8")
    signature = hmac.new(token_key.encode("utf-8"), payload, hashlib.sha256).digest()
    return f"{_b64url(payload)}.{_b64url(signature)}"


def verify_admin_token(token: str) -> bool:
    config = get_admin_config()
    token_key = config.get("tokenKey") or ""
    if not token or not token_key or "." not in token:
        return False
    encoded_payload, encoded_sig = token.split(".", 1)
    try:
        payload = _b64url_decode(encoded_payload)
        given_sig = _b64url_decode(encoded_sig)
    except Exception:
        return False
    expected_sig = hmac.new(token_key.encode("utf-8"), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(given_sig, expected_sig):
        return False
    try:
        role, expires = payload.decode("utf-8").split("|", 1)
        return role == "admin" and int(expires) > int(time.time())
    except Exception:
        return False


def password_matches(candidate: str) -> bool:
    config = get_admin_config()
    expected = config.get("password") or ""
    if not expected or not candidate:
        return False
    if expected in ("CHANGE_ME", "unset", "placeholder"):
        return False
    return hmac.compare_digest(str(candidate), str(expected))


def require_admin(event):
    """Reject unless Authorization: Bearer <admin-token> is valid."""
    auth = _header(event, "authorization")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if verify_admin_token(token):
        return None
    return error_response(401, "Admin sign-in required")

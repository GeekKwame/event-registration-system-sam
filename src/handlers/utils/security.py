"""Origin-access checks and shared input validation."""
import hmac
import os
import re

from utils.response import error_response

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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

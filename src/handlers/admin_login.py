"""
POST /admin/login
Exchanges the admin password for a short-lived session token.
The password is never stored in the frontend or returned to the browser.
"""
import json

from utils.response import build_response, error_response
from utils.security import issue_admin_token, password_matches, require_cloudfront_origin


def handler(event, context):
    denied = require_cloudfront_origin(event)
    if denied:
        return denied

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return error_response(400, "Request body must be valid JSON")

    password = str(body.get("password") or "")
    if not password_matches(password):
        return error_response(401, "Invalid admin password")

    token = issue_admin_token()
    if not token:
        return error_response(500, "Admin authentication is not configured")

    return build_response(200, {
        "message": "Admin session started",
        "token": token,
        "expiresInSeconds": 8 * 60 * 60,
    })

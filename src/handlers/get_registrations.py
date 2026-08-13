"""
GET /registrations
GET /registrations/{email}

Lists attendee registrations for the event dashboard.
With an email path parameter, results are limited to that attendee.
"""
import os
import boto3
from boto3.dynamodb.conditions import Key
from utils.response import build_response, error_response
from utils.security import is_valid_email, require_cloudfront_origin
from utils.providers import registrations_for

dynamodb = boto3.resource("dynamodb")
REGISTRATIONS_TABLE = os.environ["REGISTRATIONS_TABLE"]


def _scan_all(table):
    items = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    return items


def _query_email(table, email):
    items = []
    kwargs = {
        "IndexName": "EmailIndex",
        "KeyConditionExpression": Key("email").eq(email),
    }
    while True:
        response = table.query(**kwargs)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return items


def handler(event, context):
    denied = require_cloudfront_origin(event)
    if denied:
        return denied

    path_params = event.get("pathParameters") or {}
    email = (path_params.get("email") or "").strip().lower()
    list_all = not email or email == "all"

    if not list_all and not is_valid_email(email):
        return error_response(400, "A valid email address is required")

    table = dynamodb.Table(REGISTRATIONS_TABLE)
    try:
        items = _scan_all(table) if list_all else _query_email(table, email)

        known_ids = set()
        for item in items:
            item.pop("providerResponse", None)
            if item.get("registrationId"):
                known_ids.add(str(item["registrationId"]))
            if item.get("providerRegistrationId"):
                known_ids.add(str(item["providerRegistrationId"]))

        remote_provider_items = registrations_for("" if list_all else email)
        for p_item in remote_provider_items:
            p_id = str(p_item.get("registrationId") or p_item.get("registration_id") or p_item.get("id") or "")
            if p_id and p_id not in known_ids:
                items.append(p_item)
                known_ids.add(p_id)

        items.sort(key=lambda x: x.get("createdAt", "") or x.get("registered_at", ""), reverse=True)
        payload = {"registrations": items, "count": len(items)}
        if not list_all:
            payload["email"] = email
        return build_response(200, payload)

    except Exception as exc:
        return error_response(500, f"Could not fetch registrations: {str(exc)}")

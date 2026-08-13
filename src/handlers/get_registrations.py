"""
GET /registrations/{email}
Returns registrations for a single attendee email via EmailIndex GSI.
The catch-all "all" path is rejected so attendee PII is not dumped publicly.
"""
import os
import boto3
from boto3.dynamodb.conditions import Key
from utils.response import build_response, error_response
from utils.security import is_valid_email, require_cloudfront_origin
from utils.providers import registrations_for

dynamodb = boto3.resource("dynamodb")
REGISTRATIONS_TABLE = os.environ["REGISTRATIONS_TABLE"]


def handler(event, context):
    denied = require_cloudfront_origin(event)
    if denied:
        return denied

    path_params = event.get("pathParameters") or {}
    email = (path_params.get("email") or "").strip().lower()

    if email == "all" or not is_valid_email(email):
        return error_response(400, "A valid email address is required")

    table = dynamodb.Table(REGISTRATIONS_TABLE)
    try:
        items = []
        response = table.query(
            IndexName="EmailIndex",
            KeyConditionExpression=Key("email").eq(email),
        )
        items.extend(response.get("Items", []))
        while "LastEvaluatedKey" in response:
            response = table.query(
                IndexName="EmailIndex",
                KeyConditionExpression=Key("email").eq(email),
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

        known_ids = set()
        for item in items:
            item.pop("providerResponse", None)
            if item.get("registrationId"):
                known_ids.add(str(item["registrationId"]))
            if item.get("providerRegistrationId"):
                known_ids.add(str(item["providerRegistrationId"]))

        remote_provider_items = registrations_for(email)
        for p_item in remote_provider_items:
            p_id = str(p_item.get("registrationId") or p_item.get("registration_id") or p_item.get("id") or "")
            if p_id and p_id not in known_ids:
                items.append(p_item)
                known_ids.add(p_id)

        items.sort(key=lambda x: x.get("createdAt", "") or x.get("registered_at", ""), reverse=True)
        return build_response(200, {"registrations": items, "count": len(items), "email": email})

    except Exception as exc:
        return error_response(500, f"Could not fetch registrations: {str(exc)}")

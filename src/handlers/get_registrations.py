"""
GET /registrations/{email}
Returns every registration made by a given email address using EmailIndex GSI.
If email is 'all' or empty, scans and returns all registered participants.
"""
import os
import boto3
from boto3.dynamodb.conditions import Key
from utils.response import build_response, error_response
from utils.providers import registrations_for

dynamodb = boto3.resource("dynamodb")
REGISTRATIONS_TABLE = os.environ["REGISTRATIONS_TABLE"]


def handler(event, context):
    path_params = event.get("pathParameters") or {}
    email = (path_params.get("email") or "").strip().lower()

    table = dynamodb.Table(REGISTRATIONS_TABLE)
    try:
        items = []
        if email == "all" or not email:
            response = table.scan()
            items.extend(response.get("Items", []))
            while "LastEvaluatedKey" in response:
                response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
                items.extend(response.get("Items", []))
        else:
            response = table.query(
                IndexName="EmailIndex",
                KeyConditionExpression=Key("email").eq(email),
            )
            items.extend(response.get("Items", []))

        # Collect known IDs (both local registrationId and providerRegistrationId)
        known_ids = set()
        for item in items:
            if item.get("registrationId"):
                known_ids.add(str(item["registrationId"]))
            if item.get("providerRegistrationId"):
                known_ids.add(str(item["providerRegistrationId"]))

        # Include compatible provider records without creating duplicates
        remote_provider_items = registrations_for(email if email != "all" else "")
        for p_item in remote_provider_items:
            p_id = str(p_item.get("registrationId") or p_item.get("registration_id") or p_item.get("id") or "")
            if p_id and p_id not in known_ids:
                items.append(p_item)
                known_ids.add(p_id)

        # Sort by creation date descending (newest first)
        items.sort(key=lambda x: x.get("createdAt", "") or x.get("registered_at", ""), reverse=True)
        return build_response(200, {"registrations": items, "count": len(items)})

    except Exception as exc:
        return error_response(500, f"Could not fetch registrations: {str(exc)}")

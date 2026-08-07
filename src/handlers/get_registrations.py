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
        if email == "all" or not email:
            items = []
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
            items = response.get("Items", [])
            # Include compatible provider records so attendees can see
            # registrations created before migrating to EventPulse.
            known_ids = {item.get("registrationId") for item in items}
            items.extend(item for item in registrations_for(email) if item["registrationId"] not in known_ids)

        # Sort by creation date descending (newest first)
        items.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        return build_response(200, {"registrations": items, "count": len(items)})

    except Exception as exc:
        return error_response(500, f"Could not fetch registrations: {str(exc)}")

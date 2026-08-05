"""
GET /registrations/{email}
Returns every registration made by a given email address,
using the EmailIndex Global Secondary Index for an efficient query
(instead of scanning the whole table).
"""
import os
import boto3
from boto3.dynamodb.conditions import Key
from utils.response import build_response, error_response

dynamodb = boto3.resource("dynamodb")
REGISTRATIONS_TABLE = os.environ["REGISTRATIONS_TABLE"]


def handler(event, context):
    path_params = event.get("pathParameters") or {}
    email = (path_params.get("email") or "").strip().lower()

    if not email:
        return error_response(400, "email path parameter is required")

    table = dynamodb.Table(REGISTRATIONS_TABLE)
    try:
        response = table.query(
            IndexName="EmailIndex",
            KeyConditionExpression=Key("email").eq(email),
        )
        items = response.get("Items", [])
        return build_response(200, {"registrations": items, "count": len(items)})

    except Exception as exc:
        return error_response(500, f"Could not fetch registrations: {str(exc)}")

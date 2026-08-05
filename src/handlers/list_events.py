"""
GET /events
Returns every event in the Events table, sorted by date ascending.
"""
import os
import boto3
from utils.response import build_response, error_response

dynamodb = boto3.resource("dynamodb")
EVENTS_TABLE = os.environ["EVENTS_TABLE"]


def handler(event, context):
    table = dynamodb.Table(EVENTS_TABLE)
    try:
        items = []
        response = table.scan()
        items.extend(response.get("Items", []))

        # DynamoDB scan is paginated - keep going until we have everything
        while "LastEvaluatedKey" in response:
            response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            items.extend(response.get("Items", []))

        items.sort(key=lambda e: e.get("date", ""))
        return build_response(200, {"events": items, "count": len(items)})

    except Exception as exc:
        return error_response(500, f"Could not list events: {str(exc)}")

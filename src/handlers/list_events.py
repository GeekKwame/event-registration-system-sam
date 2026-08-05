"""
GET /events
Returns every event in the Events table, sorted by date ascending,
with live registration counts computed from Registrations table.
"""
import os
import boto3
from utils.response import build_response, error_response

dynamodb = boto3.resource("dynamodb")
EVENTS_TABLE = os.environ["EVENTS_TABLE"]
REGISTRATIONS_TABLE = os.environ.get("REGISTRATIONS_TABLE", "")


def handler(event, context):
    events_table = dynamodb.Table(EVENTS_TABLE)
    try:
        items = []
        response = events_table.scan()
        items.extend(response.get("Items", []))

        # DynamoDB scan is paginated - keep going until we have everything
        while "LastEvaluatedKey" in response:
            response = events_table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            items.extend(response.get("Items", []))

        # Compute dynamic registeredCount for each event
        reg_counts = {}
        if REGISTRATIONS_TABLE:
            try:
                regs_table = dynamodb.Table(REGISTRATIONS_TABLE)
                reg_response = regs_table.scan(ProjectionExpression="eventId")
                reg_items = reg_response.get("Items", [])
                while "LastEvaluatedKey" in reg_response:
                    reg_response = regs_table.scan(
                        ProjectionExpression="eventId",
                        ExclusiveStartKey=reg_response["LastEvaluatedKey"]
                    )
                    reg_items.extend(reg_response.get("Items", []))

                for reg in reg_items:
                    eid = reg.get("eventId")
                    if eid:
                        reg_counts[eid] = reg_counts.get(eid, 0) + 1
            except Exception:
                pass

        for item in items:
            eid = item.get("eventId")
            item["registeredCount"] = reg_counts.get(eid, 0)

        items.sort(key=lambda e: e.get("date", ""))
        return build_response(200, {"events": items, "count": len(items)})

    except Exception as exc:
        return error_response(500, f"Could not list events: {str(exc)}")

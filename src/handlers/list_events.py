"""
GET /events
Returns every event in the Events table, sorted by date ascending,
with live registration counts computed from Registrations table.
"""
import os
import boto3
from utils.response import build_response, error_response
from utils.providers import list_events as provider_events

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

        # Auto-seed local events into DynamoDB if table is currently empty
        if not items:
            default_events = [
                {
                    "eventId": "evt-001",
                    "eventName": "AWS Workshop Accra 2026",
                    "date": "2026-08-15",
                    "location": "Accra Digital Center",
                    "capacity": 30,
                    "description": "Hands-on serverless workshop with AWS SAM and Lambda."
                },
                {
                    "eventId": "evt-002",
                    "eventName": "Cloud Native Kumasi Summit",
                    "date": "2026-08-20",
                    "location": "KNUST Tech Hub",
                    "capacity": 50,
                    "description": "Exploring Kubernetes, Serverless, and DevOps practices."
                }
            ]
            for seed_evt in default_events:
                try:
                    events_table.put_item(Item=seed_evt)
                except Exception:
                    pass
            items = list(default_events)

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

        def normalize_event_id(eid):
            if not eid:
                return ""
            s = str(eid).strip()
            if s == "evt-101":
                return "evt-001"
            if s == "evt-102":
                return "evt-002"
            return s

        for reg in reg_items:
            eid = normalize_event_id(reg.get("eventId"))
            if eid:
                reg_counts[eid] = reg_counts.get(eid, 0) + 1

        for item in items:
            eid = normalize_event_id(item.get("eventId"))
            item["registeredCount"] = reg_counts.get(eid, 0)

        items.sort(key=lambda e: e.get("date", ""))
        return build_response(200, {"events": items, "count": len(items)})

    except Exception as exc:
        return error_response(500, f"Could not list events: {str(exc)}")

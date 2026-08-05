"""
Seeds the Events table with a couple of sample events so /events and
/register have something to work with right after deployment.

Usage:
    python scripts/seed_events.py events-dev
    (replace 'events-dev' with your actual table name from `sam deploy` outputs)
"""
import sys
import boto3

if len(sys.argv) != 2:
    print("Usage: python scripts/seed_events.py <events-table-name>")
    sys.exit(1)

table_name = sys.argv[1]
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(table_name)

sample_events = [
    {
        "eventId": "evt-001",
        "eventName": "AWS Workshop Accra 2026",
        "date": "2026-05-15",
        "capacity": 100,
        "status": "Available",
    },
    {
        "eventId": "evt-002",
        "eventName": "Cloud Solutions Summit",
        "date": "2026-06-28",
        "capacity": 40,
        "status": "Limited",
    },
]

for event in sample_events:
    table.put_item(Item=event)
    print(f"Seeded: {event['eventName']} ({event['eventId']})")

print("Done. Try: GET /events")

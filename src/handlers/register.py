"""
POST /register
Registers a participant for an event.

Expected JSON body:
{
  "eventId": "evt-001",
  "email": "participant@email.com",
  "name": "Optional Participant Name"
}
"""
import os
import json
import uuid
import re
from datetime import datetime, timezone

import boto3
from utils.response import build_response, error_response

dynamodb = boto3.resource("dynamodb")
sns = boto3.client("sns")

EVENTS_TABLE = os.environ["EVENTS_TABLE"]
REGISTRATIONS_TABLE = os.environ["REGISTRATIONS_TABLE"]
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return error_response(400, "Request body must be valid JSON")

    event_id = (body.get("eventId") or "").strip()
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()

    # --- Input validation -------------------------------------------------
    if not event_id:
        return error_response(400, "eventId is required")
    if not email or not EMAIL_REGEX.match(email):
        return error_response(400, "A valid email address is required")

    # --- Confirm the event exists ------------------------------------------
    events_table = dynamodb.Table(EVENTS_TABLE)
    event_item = events_table.get_item(Key={"eventId": event_id}).get("Item")
    if not event_item:
        return error_response(404, f"Event '{event_id}' does not exist")

    # --- Save the registration ---------------------------------------------
    registrations_table = dynamodb.Table(REGISTRATIONS_TABLE)
    registration_id = str(uuid.uuid4())
    item = {
        "registrationId": registration_id,
        "eventId": event_id,
        "eventName": event_item.get("eventName", event_id),
        "email": email,
        "name": name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "confirmed",
    }
    registrations_table.put_item(Item=item)

    # --- Optional confirmation email via SNS --------------------------------
    if SNS_TOPIC_ARN:
        try:
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject="Event Registration Confirmed",
                Message=(
                    f"Hi {name or 'there'},\n\n"
                    f"You're registered for {item['eventName']}.\n"
                    f"Registration ID: {registration_id}\n"
                ),
            )
        except Exception:
            # Never fail the registration just because the email couldn't send
            pass

    return build_response(201, {"message": "Registration successful", "registration": item})

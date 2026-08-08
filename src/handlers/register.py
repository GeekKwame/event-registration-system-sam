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
from utils.providers import ProviderError, register as register_with_provider

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
    provider_id = (body.get("providerId") or "").strip()
    source_event_id = (body.get("sourceEventId") or "").strip()
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()

    # --- Input validation -------------------------------------------------
    if not event_id:
        return error_response(400, "eventId is required")
    if not email or not EMAIL_REGEX.match(email):
        return error_response(400, "A valid email address is required")

    # --- Register through an external provider, then mirror the result -----
    # Namespaced IDs prevent two providers' "101" events from colliding.
    if provider_id:
        if not source_event_id and event_id.startswith(f"{provider_id}:"):
            source_event_id = event_id.split(":", 1)[1]
        if not source_event_id:
            return error_response(400, "sourceEventId is required for provider events")
        try:
            provider_response = register_with_provider(provider_id, source_event_id, email, name)
        except ProviderError as exc:
            return error_response(502, str(exc))

        registration_id = str(uuid.uuid4())
        provider_registration = provider_response.get("registration", provider_response) if isinstance(provider_response, dict) else {}
        item = {
            "registrationId": registration_id,
            "eventId": event_id or f"{provider_id}:{source_event_id}",
            "sourceEventId": source_event_id,
            "providerId": provider_id,
            "email": email,
            "name": name,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "status": "confirmed",
            "providerResponse": provider_response,
        }
        remote_registration_id = provider_registration.get("registrationId") or provider_registration.get("registration_id") or provider_registration.get("id")
        if remote_registration_id:
            item["providerRegistrationId"] = str(remote_registration_id)
        dynamodb.Table(REGISTRATIONS_TABLE).put_item(Item=item)

        if SNS_TOPIC_ARN:
            try:
                event_name_str = item.get("eventName") or event_id
                sns.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject=f"🎉 Event Registration Confirmed: {event_name_str}",
                    Message=(
                        f"Hello {name or email},\n\n"
                        f"Your registration for '{event_name_str}' has been confirmed!\n\n"
                        f"--- Registration Details ---\n"
                        f"• Event ID: {event_id}\n"
                        f"• Participant: {name or 'N/A'} ({email})\n"
                        f"• Registration Ticket ID: {registration_id}\n"
                        f"• Date Confirmed: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
                        f"Thank you for using EventPulse Universal Ticketing!"
                    ),
                )
            except Exception as sns_err:
                print(f"SNS Publish Error: {sns_err}")

        return build_response(201, {
            "message": "Registration successful",
            "registration": item,
        })

    # --- Confirm the local EventPulse event exists -------------------------
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

    # --- Confirmation email via SNS ----------------------------------------
    if SNS_TOPIC_ARN:
        try:
            event_name_str = item.get("eventName") or event_id
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject=f"🎉 Event Registration Confirmed: {event_name_str}",
                Message=(
                    f"Hello {name or email},\n\n"
                    f"Your registration for '{event_name_str}' has been confirmed!\n\n"
                    f"--- Registration Details ---\n"
                    f"• Event ID: {event_id}\n"
                    f"• Participant: {name or 'N/A'} ({email})\n"
                    f"• Registration Ticket ID: {registration_id}\n"
                    f"• Date Confirmed: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
                    f"Thank you for using EventPulse Universal Ticketing!"
                ),
            )
        except Exception as sns_err:
            print(f"SNS Publish Error: {sns_err}")

    return build_response(201, {"message": "Registration successful", "registration": item})

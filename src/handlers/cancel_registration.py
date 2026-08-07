"""
DELETE /registration/{id}
Cancels (deletes) a single registration by its registrationId.
"""
import os
import boto3
from utils.response import build_response, error_response
from utils.providers import ProviderError, cancel as cancel_with_provider

dynamodb = boto3.resource("dynamodb")
REGISTRATIONS_TABLE = os.environ["REGISTRATIONS_TABLE"]


def handler(event, context):
    path_params = event.get("pathParameters") or {}
    registration_id = (path_params.get("id") or "").strip()

    if not registration_id:
        return error_response(400, "registration id path parameter is required")

    table = dynamodb.Table(REGISTRATIONS_TABLE)

    # Confirm it exists first so we can return a proper 404 instead of a
    # silent no-op delete (DynamoDB delete_item doesn't error on missing keys)
    existing = table.get_item(Key={"registrationId": registration_id}).get("Item")
    if not existing:
        return error_response(404, f"Registration '{registration_id}' not found")

    provider_id = existing.get("providerId")
    remote_id = existing.get("providerRegistrationId")
    if provider_id and remote_id:
        try:
            cancel_with_provider(provider_id, remote_id)
        except ProviderError as exc:
            return error_response(502, str(exc))

    table.delete_item(Key={"registrationId": registration_id})
    return build_response(200, {"message": "Registration cancelled", "registrationId": registration_id})

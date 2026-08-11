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

    # 1. Look up item by primary key
    existing = table.get_item(Key={"registrationId": registration_id}).get("Item")

    # 2. If not found by primary key, search by providerRegistrationId attribute
    if not existing:
        scan_res = table.scan(
            FilterExpression="providerRegistrationId = :pid",
            ExpressionAttributeValues={":pid": registration_id}
        )
        items = scan_res.get("Items", [])
        if items:
            existing = items[0]

    # 3. If still not found, try it as a namespaced provider id ("provider:remoteId")
    if not existing:
        if ":" in registration_id:
            provider_id, _, remote_id = registration_id.partition(":")
            try:
                cancel_with_provider(provider_id, remote_id)
                return build_response(200, {"message": "Registration cancelled with provider", "registrationId": registration_id})
            except ProviderError:
                pass
        return error_response(404, f"Registration '{registration_id}' not found")

    # Cancel with provider if linked to an external system
    provider_id = existing.get("providerId")
    remote_id = existing.get("providerRegistrationId") or registration_id
    if provider_id and remote_id:
        try:
            cancel_with_provider(provider_id, remote_id)
        except ProviderError:
            # Continue deleting local item even if remote provider produces an error
            pass

    table.delete_item(Key={"registrationId": existing["registrationId"]})
    return build_response(200, {"message": "Registration cancelled", "registrationId": registration_id})
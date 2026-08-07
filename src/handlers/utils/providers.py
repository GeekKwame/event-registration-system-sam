"""Adapters for external event APIs.

Every provider is normalized at this boundary so browser code only needs the
EventPulse contract. Provider credentials belong in a Secrets Manager-backed
configuration in production; the sample provider is public and read-only.
"""
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class ProviderError(Exception):
    """A provider could not complete a request."""


def _providers():
    try:
        configured = json.loads(os.environ.get("PROVIDERS_JSON", "[]"))
    except json.JSONDecodeError as exc:
        raise ProviderError("Provider configuration is invalid") from exc
    return {item["id"]: item for item in configured if item.get("id") and item.get("baseUrl")}


def _request(provider, path, method="GET", payload=None):
    base_url = provider["baseUrl"].rstrip("/")
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(f"{base_url}{path}", data=data, method=method)
    request.add_header("Accept", "application/json")
    if data:
        request.add_header("Content-Type", "application/json")

    # Inject optional provider authentication credentials
    if "apiKey" in provider:
        request.add_header("X-API-Key", provider["apiKey"])
    if "token" in provider:
        request.add_header("Authorization", f"Bearer {provider['token']}")
    if isinstance(provider.get("headers"), dict):
        for k, v in provider["headers"].items():
            request.add_header(k, str(v))

    timeout = provider.get("timeout", 8)
    try:
        with urlopen(request, timeout=timeout) as response:  # nosec B310 - configured HTTPS provider URL
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ProviderError(f"Provider '{provider['id']}' is unavailable") from exc


def _records(payload, key):
    if isinstance(payload, list):
        return payload
    return payload.get(key) or payload.get("data") or payload.get("items") or payload.get("results") or []


def list_events():
    """Return all configured provider events in the canonical EventPulse shape."""
    events = []
    for provider_id, provider in _providers().items():
        try:
            records = _records(_request(provider, "/events"), "events")
        except ProviderError:
            continue
        for record in records:
            source_id = str(record.get("eventId") or record.get("event_id") or record.get("id") or record.get("_id") or "").strip()
            if not source_id:
                continue
            events.append({
                "eventId": f"{provider_id}:{source_id}",
                "sourceEventId": source_id,
                "providerId": provider_id,
                "region": provider.get("region", "us-east-1"),
                "eventName": record.get("eventName") or record.get("name") or record.get("title") or source_id,
                "date": record.get("date", ""),
                "location": record.get("location", ""),
                "description": record.get("description") or record.get("summary", ""),
                "capacity": record.get("capacity") or record.get("max_capacity") or record.get("total_seats") or 0,
            })
    return events


def register(provider_id, source_event_id, email, name):
    provider = _providers().get(provider_id)
    if not provider:
        raise ProviderError("Unknown event provider")
    # Send common aliases so simple snake_case and camelCase provider APIs work.
    return _request(provider, "/register", "POST", {
        "eventId": source_event_id,
        "event_id": source_event_id,
        "id": source_event_id,
        "email": email,
        "name": name,
    })


def cancel(provider_id, registration_id):
    provider = _providers().get(provider_id)
    if not provider:
        raise ProviderError("Unknown event provider")
    return _request(provider, f"/registration/{quote(registration_id)}", "DELETE")


def registrations_for(email):
    """Return provider registrations for one attendee; never assumes /all exists."""
    registrations = []
    for provider_id, provider in _providers().items():
        try:
            records = _records(_request(provider, f"/registrations/{quote(email)}"), "registrations")
        except ProviderError:
            continue
        for record in records:
            source_event_id = str(record.get("eventId") or record.get("event_id") or "").strip()
            remote_id = str(record.get("registrationId") or record.get("registration_id") or record.get("id") or "").strip()
            if not source_event_id or not remote_id:
                continue
            registrations.append({
                "registrationId": f"{provider_id}:{remote_id}",
                "eventId": f"{provider_id}:{source_event_id}",
                "sourceEventId": source_event_id,
                "providerId": provider_id,
                "email": record.get("email") or email,
                "name": record.get("name", ""),
                "status": record.get("status", "confirmed"),
                "createdAt": record.get("createdAt") or record.get("registered_at") or record.get("timestamp", ""),
                "external": True,
            })
    return registrations

"""
Basic unit tests for the Lambda handlers.

These use `moto` to mock DynamoDB so you don't need real AWS resources
or credentials to run them - perfect for the CI/CD pipeline.

Run with:
    pip install -r tests/requirements-test.txt
    pytest tests/
"""
import os
import json
import sys
import importlib

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "handlers"))

EVENTS_TABLE = "events-test"
REGISTRATIONS_TABLE = "registrations-test"


@pytest.fixture
def dynamodb_tables():
    os.environ["EVENTS_TABLE"] = EVENTS_TABLE
    os.environ["REGISTRATIONS_TABLE"] = REGISTRATIONS_TABLE
    os.environ["SNS_TOPIC_ARN"] = ""
    os.environ["PROVIDERS_JSON"] = "[]"
    os.environ["ORIGIN_VERIFY_SECRET"] = ""
    os.environ["RESEND_SECRET_ARN"] = ""
    os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
    os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
    os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

    with mock_aws():
        client = boto3.resource("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName=EVENTS_TABLE,
            KeySchema=[{"AttributeName": "eventId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "eventId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        client.create_table(
            TableName=REGISTRATIONS_TABLE,
            KeySchema=[{"AttributeName": "registrationId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "registrationId", "AttributeType": "S"},
                {"AttributeName": "email", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "EmailIndex",
                    "KeySchema": [{"AttributeName": "email", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        client.Table(EVENTS_TABLE).put_item(
            Item={"eventId": "evt-001", "eventName": "Test Event", "date": "2026-01-01"}
        )
        yield client


def _reload(module_name):
    if module_name in sys.modules:
        return importlib.reload(sys.modules[module_name])
    return importlib.import_module(module_name)


def test_list_events(dynamodb_tables):
    list_events = _reload("list_events")
    result = list_events.handler({}, None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["count"] >= 1
    assert body["events"][0]["eventId"] == "evt-001"


def test_list_events_returns_dynamodb_items(dynamodb_tables):
    list_events = _reload("list_events")
    result = list_events.handler({}, None)
    body = json.loads(result["body"])
    assert "events" in body
    assert body["count"] >= 1


def test_register_success(dynamodb_tables):
    register = _reload("register")
    event = {"body": json.dumps({"eventId": "evt-001", "email": "friend@example.com"})}
    result = register.handler(event, None)
    assert result["statusCode"] == 201
    body = json.loads(result["body"])
    assert body["registration"]["email"] == "friend@example.com"


def test_register_missing_event(dynamodb_tables):
    register = _reload("register")
    event = {"body": json.dumps({"eventId": "does-not-exist", "email": "friend@example.com"})}
    result = register.handler(event, None)
    assert result["statusCode"] == 404


def test_register_invalid_email(dynamodb_tables):
    register = _reload("register")
    event = {"body": json.dumps({"eventId": "evt-001", "email": "not-an-email"})}
    result = register.handler(event, None)
    assert result["statusCode"] == 400


def test_register_provider_event_mirrors_registration(dynamodb_tables, monkeypatch):
    register = _reload("register")
    monkeypatch.setattr(register, "register_with_provider", lambda *args: {"registration_id": "remote-123"})
    event = {"body": json.dumps({
        "eventId": "accra-events:101", "sourceEventId": "101", "providerId": "accra-events",
        "email": "friend@example.com", "name": "Friend",
    })}
    result = register.handler(event, None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 201
    assert body["registration"]["eventId"] == "accra-events:101"
    assert body["registration"]["providerRegistrationId"] == "remote-123"


def test_get_registrations_and_cancel(dynamodb_tables):
    register = _reload("register")
    get_registrations = _reload("get_registrations")
    cancel_registration = _reload("cancel_registration")

    reg_event = {"body": json.dumps({"eventId": "evt-001", "email": "friend@example.com"})}
    reg_result = register.handler(reg_event, None)
    reg_id = json.loads(reg_result["body"])["registration"]["registrationId"]

    get_event = {"pathParameters": {"email": "friend@example.com"}}
    get_result = get_registrations.handler(get_event, None)
    assert get_result["statusCode"] == 200
    assert json.loads(get_result["body"])["count"] == 1

    cancel_event = {"pathParameters": {"id": reg_id}}
    cancel_result = cancel_registration.handler(cancel_event, None)
    assert cancel_result["statusCode"] == 200

    cancel_again = cancel_registration.handler(cancel_event, None)
    assert cancel_again["statusCode"] == 404


def test_get_registrations_includes_provider_records(dynamodb_tables, monkeypatch):
    get_registrations = _reload("get_registrations")
    monkeypatch.setattr(get_registrations, "registrations_for", lambda email: [{
        "registrationId": "accra-events:remote-123", "eventId": "accra-events:101", "providerId": "accra-events", "email": email,
    }])
    result = get_registrations.handler({"pathParameters": {"email": "friend@example.com"}}, None)
    body = json.loads(result["body"])
    assert body["count"] == 1
    assert body["registrations"][0].get("providerId") == "accra-events" or body["registrations"][0]["registrationId"] == "accra-events:remote-123"


def test_provider_adapter_headers_and_region(monkeypatch):
    providers_mod = _reload("utils.providers")
    monkeypatch.setenv("PROVIDERS_JSON", json.dumps([{
        "id": "eu-events",
        "baseUrl": "https://eu-west-1.example.com",
        "region": "eu-west-1",
        "apiKey": "secret-key",
        "token": "bearer-token",
        "headers": {"X-Custom": "CustomVal"}
    }]))

    captured_headers = {}

    def mock_urlopen(req, timeout=8):
        class MockResponse:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def read(self):
                return json.dumps({"events": [{"id": "99", "name": "London Tech Expo"}]}).encode("utf-8")
        captured_headers.update(req.headers)
        return MockResponse()

    monkeypatch.setattr(providers_mod, "urlopen", mock_urlopen)
    events = providers_mod.list_events()

    assert len(events) == 1
    assert events[0]["eventId"] == "eu-events:99"
    assert events[0]["region"] == "eu-west-1"
    assert captured_headers.get("X-api-key") == "secret-key" or captured_headers.get("X-API-Key") == "secret-key"


def test_register_duplicate_email_rejected(dynamodb_tables):
    register = _reload("register")
    event = {"body": json.dumps({"eventId": "evt-001", "email": "friend@example.com", "name": "Friend"})}
    first = register.handler(event, None)
    second = register.handler(event, None)
    assert first["statusCode"] == 201
    assert second["statusCode"] == 409


def test_register_rejects_when_event_is_full(dynamodb_tables):
    dynamodb_tables.Table(EVENTS_TABLE).put_item(
        Item={"eventId": "evt-full", "eventName": "Packed Hall", "capacity": 1, "date": "2026-01-02"}
    )
    register = _reload("register")
    first = register.handler({"body": json.dumps({"eventId": "evt-full", "email": "one@example.com"})}, None)
    second = register.handler({"body": json.dumps({"eventId": "evt-full", "email": "two@example.com"})}, None)
    assert first["statusCode"] == 201
    assert second["statusCode"] == 409


def test_get_registrations_lists_all_when_no_email(dynamodb_tables):
    register = _reload("register")
    get_registrations = _reload("get_registrations")
    register.handler({"body": json.dumps({"eventId": "evt-001", "email": "one@example.com", "name": "One"})}, None)
    register.handler({"body": json.dumps({"eventId": "evt-001", "email": "two@example.com", "name": "Two"})}, None)
    result = get_registrations.handler({"pathParameters": None}, None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["count"] == 2


def test_get_registrations_all_alias_lists_everyone(dynamodb_tables):
    register = _reload("register")
    get_registrations = _reload("get_registrations")
    register.handler({"body": json.dumps({"eventId": "evt-001", "email": "one@example.com"})}, None)
    result = get_registrations.handler({"pathParameters": {"email": "all"}}, None)
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["count"] == 1


def test_resend_key_is_read_from_secrets_manager(dynamodb_tables, monkeypatch):
    monkeypatch.setenv("RESEND_SECRET_ARN", "arn:aws:secretsmanager:us-west-1:1234:secret:resend")
    register = _reload("register")

    calls = []

    class FakeSecrets:
        def get_secret_value(self, SecretId):
            calls.append(SecretId)
            return {"SecretString": json.dumps({"apiKey": "re_live_key"})}

    monkeypatch.setattr(register.boto3, "client", lambda service, *a, **kw: FakeSecrets())

    assert register.get_resend_api_key() == "re_live_key"
    # Cached after the first read so every registration does not hit Secrets Manager.
    assert register.get_resend_api_key() == "re_live_key"
    assert len(calls) == 1


def test_resend_placeholder_secret_disables_sending(dynamodb_tables, monkeypatch):
    monkeypatch.setenv("RESEND_SECRET_ARN", "arn:aws:secretsmanager:us-west-1:1234:secret:resend")
    register = _reload("register")

    class FakeSecrets:
        def get_secret_value(self, SecretId):
            return {"SecretString": json.dumps({"apiKey": "GeneratedPlaceholderValue"})}

    monkeypatch.setattr(register.boto3, "client", lambda service, *a, **kw: FakeSecrets())

    assert register.get_resend_api_key() == ""


def test_resend_key_is_picked_up_without_redeploy(dynamodb_tables, monkeypatch):
    """A rotated key must apply on the next invocation, not the next cold start."""
    monkeypatch.setenv("RESEND_SECRET_ARN", "arn:aws:secretsmanager:us-west-1:1234:secret:resend")
    register = _reload("register")

    stored = {"apiKey": "PlaceholderNotARealKey"}

    class FakeSecrets:
        def get_secret_value(self, SecretId):
            return {"SecretString": json.dumps(stored)}

    monkeypatch.setattr(register.boto3, "client", lambda service, *a, **kw: FakeSecrets())

    assert register.get_resend_api_key() == ""
    stored["apiKey"] = "re_rotated_key"
    assert register.get_resend_api_key() == "re_rotated_key"


def test_origin_verify_rejects_direct_api_access(dynamodb_tables, monkeypatch):
    monkeypatch.setenv("ORIGIN_VERIFY_SECRET", "cloudfront-origin-token")
    list_events = _reload("list_events")
    denied = list_events.handler({"headers": {}}, None)
    allowed = list_events.handler({"headers": {"X-Origin-Verify": "cloudfront-origin-token"}}, None)
    assert denied["statusCode"] == 403
    assert allowed["statusCode"] == 200


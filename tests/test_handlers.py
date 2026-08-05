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
    assert body["count"] == 1
    assert body["events"][0]["eventId"] == "evt-001"


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

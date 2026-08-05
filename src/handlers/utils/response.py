"""
Shared helper for building consistent, CORS-friendly API Gateway responses.
Every Lambda handler imports this so the response shape never drifts.
"""
import json
import decimal


class DecimalEncoder(json.JSONEncoder):
    """DynamoDB returns numbers as Decimal - this makes them JSON-safe."""
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


def build_response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        },
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def error_response(status_code: int, message: str) -> dict:
    return build_response(status_code, {"error": message})

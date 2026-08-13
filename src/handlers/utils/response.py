"""
Shared helper for building consistent API Gateway JSON responses.
CORS is not required for same-origin CloudFront traffic; headers are kept
narrow for sam local and non-browser clients.
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
            "Cache-Control": "no-store",
        },
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def error_response(status_code: int, message: str) -> dict:
    return build_response(status_code, {"error": message})

# System Architecture Guide

Production traffic terminates at **Amazon CloudFront**. API Gateway is an origin, not a public browser endpoint.

---

## Official AWS architecture

![Event-Connect production AWS architecture](architecture.png)

---

## High-level architecture

```
                          ┌──────────────────────────┐
                          │     Browser / Client     │
                          └─────────────┬────────────┘
                                        │ HTTPS
                                        ▼
                          ┌──────────────────────────┐
                          │     Amazon CloudFront    │
                          │  TLS 1.2+ · security hdrs│
                          └───────┬──────────┬───────┘
                    /*            │          │   /api/*
                                  ▼          ▼
                     ┌────────────────┐  ┌─────────────────────┐
                     │ Private S3     │  │ API Gateway (hidden)│
                     │ (OAC only)     │  │ + origin secret hdr │
                     └────────────────┘  └──────────┬──────────┘
                                                    │
                                                    ▼
                                         ┌─────────────────────┐
                                         │ Regional WAF        │
                                         │ default deny        │
                                         └──────────┬──────────┘
                                                    │
              ┌─────────────────────────────────────┼─────────────────────────────┐
              ▼                                     ▼                             ▼
     POST /register                          GET /events              GET /registrations/{email}
     DELETE /registration/{id}                    │                             │
              ▼                                     ▼                             ▼
     Register / Cancel Lambda              List Events Lambda           Get Registrations Lambda
              │                                     │                             │
              └──────────────────► DynamoDB (SSE + PITR) ◄────────────────────────┘
                                        │
                                        ▼
                              SNS / SES confirmations
                              CloudWatch error alarms
```

---

## Why CloudFront is the public edge

| Control | Purpose |
|---|---|
| Same-origin `/api/*` | Browser never learns the `execute-api` hostname |
| Origin custom header `X-Origin-Verify` | CloudFront proves it is the caller |
| CloudFront Function | Drops spoofed `X-Origin-Verify` from viewers and strips `/api` |
| Regional WAF | Default-deny on API Gateway; allow only the origin secret |
| Lambda origin check | Defense in depth if WAF is bypassed |
| S3 Block Public Access + OAC | Frontend files are not a public bucket website |
| Response headers policy | HSTS, CSP, frame deny, nosniff |

Partner APIs, if any, are called **server-side** from Lambda via `PROVIDERS_JSON`. They are not selectable in the browser.

---

## AWS resources (retained + new)

Existing (Stage=`prod`):
- DynamoDB `events-prod`, `registrations-prod`
- Lambda handlers, SNS topic, CloudWatch alarm

Added for production:
- Secrets Manager origin token
- Private S3 frontend bucket
- CloudFront distribution + OAC + path rewrite function
- AWS WAF WebACL on the API stage

---

## API routes (CloudFront paths)

1. `GET /api/events` → `list_events.py`
2. `POST /api/register` → `register.py` (capacity + duplicate checks)
3. `GET /api/registrations` and `GET /api/registrations/{email}` → `get_registrations.py`
4. `DELETE /api/registration/{id}` → `cancel_registration.py`

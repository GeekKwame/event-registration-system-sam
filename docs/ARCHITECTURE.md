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
                         Browser ticket receipt (source of truth for the attendee)
                         SNS → admin topic only
                         SES (sandbox) / Resend → optional attendee email
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
2. `POST /api/register` → `register.py` (capacity + duplicate checks; returns the ticket in the JSON body)
3. `POST /api/admin/login` → `admin_login.py`
4. `GET /api/registrations` → `get_registrations.py` (all attendees; **admin session**)
5. `GET /api/registrations/{email}` → `get_registrations.py` (public lookup for that attendee)
6. `DELETE /api/registration/{id}` → `cancel_registration.py` (**admin session**)

The public **My tickets** tab does not list everyone. It shows tickets saved in the browser after register, and can call `GET /api/registrations/{email}` to recover tickets from another device.

## Notifications

| Channel | Who receives it | Notes |
|---|---|---|
| UI ticket receipt | The person who just registered | Always shown on success. Copied into `localStorage` for **My tickets**. |
| SNS topic | Admin subscriber only | Not an attendee inbox. |
| SES | Attendee email | Sandbox: verified identities in `us-west-1` only. |
| Resend | Attendee email | Fallback after SES fails. |

Do not treat SNS/SES as the attendee ticket. DynamoDB plus the on-screen receipt are.

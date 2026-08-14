# Event-Connect — Serverless Event Registration

Production AWS stack: **CloudFront** is the only public HTTPS endpoint. API Gateway stays a private origin (WAF + origin secret). Existing DynamoDB tables (`events-prod`, `registrations-prod`) are retained.

---

## Live site

After deploy, the public site is:

**https://d3mbqhiwlx08nz.cloudfront.net**

Do not publish or paste API Gateway `execute-api` URLs into the frontend, README, or GitHub Pages. Direct calls to API Gateway are blocked.

---

## Architecture

![Event-Connect production AWS architecture](docs/architecture.png)

```
Browser
  └── CloudFront  (public HTTPS, security headers)
        ├── /*        → private S3 bucket (OAC)
        └── /api/*    → API Gateway origin + X-Origin-Verify
                          └── Regional WAF (default deny)
                                └── Lambda + DynamoDB + SNS/SES
```

- Frontend calls same-origin paths only: `/api/events`, `/api/register`, `/api/registrations/{email}`, `/api/registration/{id}`
- CloudFront strips `/api`, injects the origin secret, and forwards to API Gateway
- WAF and Lambda reject any request missing that secret
- After register, the UI shows a ticket receipt immediately. **My tickets** keeps those tickets in this browser and can also look up DynamoDB by email
- `GET /api/registrations` lists every attendee (admin session). `GET /api/registrations/{email}` is the public lookup

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Repository layout

```text
event-registration-system/
├── template.yaml              # Full AWS stack (CloudFront, S3, WAF, API, Lambda, DynamoDB)
├── samconfig.toml             # Local deploy settings (gitignored; no secrets)
├── frontend/                  # Static UI published to S3 + CloudFront
├── src/handlers/              # Lambda code
├── scripts/sync-frontend.ps1  # Upload UI and invalidate CloudFront
└── .github/workflows/deploy.yml
```

---

## Deploy

### Prerequisites
- AWS CLI and SAM CLI
- Python 3.12

### 1. Backend (keeps existing prod tables)

```bash
sam build
sam deploy --no-confirm-changeset --parameter-overrides Stage=prod
```

`Stage=prod` is required so CloudFormation continues to use `events-prod` and `registrations-prod`.

### 2. Frontend

```powershell
.\scripts\sync-frontend.ps1
```

```bash
bash scripts/sync-frontend.sh
```

### 3. Tests

```bash
pip install -r tests/requirements-test.txt
python -m pytest tests/ -v
```

---

## API (via CloudFront only)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/events` | Catalog with live seat counts |
| POST | `/api/register` | Rejects duplicates and full events |
| POST | `/api/admin/login` | Admin password → short-lived session token |
| GET | `/api/registrations` | All attendees — **admin session required** |
| GET | `/api/registrations/{email}` | That attendee's tickets (public lookup) |
| DELETE | `/api/registration/{id}` | Cancel a ticket — **admin session required** |

Public visitors can browse events, register, see an on-screen ticket, and look up their own email. They cannot cancel tickets or list every attendee. The **My tickets** tab shows tickets saved in this browser; **Find my tickets** queries DynamoDB when they used another device.

## Admin access

The admin password lives in Secrets Manager (`event-registration-system/admin-auth`). It is not in the frontend.

```bash
# Read the current tokenKey, then set a new password without losing it
aws secretsmanager get-secret-value --secret-id event-registration-system/admin-auth --region us-west-1 --query SecretString --output text

aws secretsmanager put-secret-value \
  --secret-id event-registration-system/admin-auth \
  --region us-west-1 \
  --secret-string '{"password":"YOUR_NEW_PASSWORD","tokenKey":"KEEP_EXISTING_TOKEN_KEY"}'
```

On the live site, click **Admin**, sign in, then **Show all** and **Cancel** appear. Without admin, **This browser** lists tickets saved on the device. The session is stored in `sessionStorage` and expires after 8 hours.

---

## Secrets

The Resend API key lives in Secrets Manager, not in the template, stack parameters, or Lambda environment variables. CloudFormation creates an unusable placeholder; you write the real value once:

```bash
aws secretsmanager put-secret-value \
  --secret-id event-registration-system/resend-api-key \
  --region us-west-1 \
  --secret-string '{"apiKey":"re_YOUR_NEW_KEY"}'
```

To rotate: create a new key in Resend, delete the old one there, then run the command above with the new value. No redeploy is needed — the function reads it on the next invocation.

## Tickets vs email

The ticket is the registration record (DynamoDB) plus the on-screen receipt. Email is a backup, not the way attendees prove they registered.

- **On-screen receipt** — shown immediately after a successful `POST /api/register` (event, name, email, ticket ID). Saved in this browser under **My tickets**.
- **SNS** — notifies the *admin* topic subscriber. Attendees are not SNS subscribers, so they never get that message.
- **SES** — tries to email the attendee, but SES is still in **sandbox**. It only delivers to identities verified in `us-west-1`. Everyone else is dropped by SES.
- **Resend** — fallback after SES fails. Sends from `noreply@studentstudyplannerxyz.xyz` (domain verified in Resend). Do not set `ResendFromEmail` back to `onboarding@resend.dev`; that address can only mail the Resend account owner.

To make SES the primary attendee channel, request production access for SES in `us-west-1`. Until then, demo and use the on-screen ticket.

## Other notes

- The committed Resend key is in git history. It is still in use by choice; revoke it in Resend if that changes.
- GitHub Pages hosting is removed so the UI cannot leak API Gateway URLs.

---

## Cleanup

DynamoDB tables use `DeletionPolicy: Retain`. `sam delete` removes compute and CDN resources but keeps event and registration data.

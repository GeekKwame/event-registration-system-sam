# 🎓 Project Presentation: Event-Connect Universal Ticketing System

**Azubi Africa AWS Cloud Engineering Capstone Submission**

- **Project Title:** Event-Connect — Universal Multi-API Event Manager & Ticketing Integration Hub
- **GitHub Repository:** [GeekKwame/event-registration-system-sam](https://github.com/GeekKwame/event-registration-system-sam)
- **Live Web Application (GitHub Pages):** 👉 [https://geekkwame.github.io/event-registration-system-sam/](https://geekkwame.github.io/event-registration-system-sam/)
- **Live Primary API Gateway Base URL (`us-west-1`):** `https://kems8drwn6.execute-api.us-west-1.amazonaws.com/Prod`

---

## 🎯 1. Executive Summary & Problem Statement

### The Problem
Organizations relying on manual Microsoft Forms and Excel spreadsheets for event ticketing face three critical bottlenecks:
1. **Overbooking & Seat Oversubscription:** Forms remain open after an event reaches max capacity.
2. **Duplicate Registrations:** Attendees inadvertently submit multiple sign-ups for the same event.
3. **Multi-Region API Fragmentation:** Teams operating across different AWS regions or partner APIs cannot view or manage tickets in one central dashboard.

### The Solution: Event-Connect
Event-Connect is a production-ready, serverless event ticketing system built on AWS:
- **Automated Capacity Enforcement:** Seats update dynamically, blocking sign-ups when full.
- **Universal Multi-API Connection:** Connect to any AWS SAM API Gateway base URL (`us-west-1`, `us-east-1`) via Quick-Connect presets.
- **Cross-System Registration:** Sign up for local or partner events directly or through secure backend-to-backend Lambda routing with automatic CORS fallback.
- **Instant SNS Confirmation:** Dispatches confirmation emails automatically via Amazon SNS.
- **Zero Cost Idle:** $0 running cost on AWS Free Tier when idle.

---

## 🏛️ 2. AWS Serverless Architecture & Components

![AWS Serverless Event Registration Architecture Diagram](architecture.png)

```
┌────────────────────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│  Universal Web Dashboard (UI)  │ ────► │    AWS API Gateway     │ ────► │  AWS Lambda Handlers   │
│   (GitHub Pages / Single Page) │       │ (us-west-1 / us-east-1)│       │  (Python 3.12 Code)    │
└────────────────────────────────┘       └────────────────────────┘       └───────────┬────────────┘
                                                                                      │
                                                                                      ▼
                                                                           ┌────────────────────────┐
                                                                           │  Amazon DynamoDB       │
                                                                           │  (Events & Sign-ups)   │
                                                                           └────────────────────────┘
```

### AWS Components Built with Infrastructure-as-Code (`template.yaml`):
1. **AWS API Gateway:** REST API router with CORS support (`GET /events`, `POST /register`, `GET /registrations/{email}`, `GET /registrations/all`, `DELETE /registration/{id}`).
2. **AWS Lambda (Python 3.12):**
   - `ListEventsFunction`: Returns open events with registered attendee counts.
   - `RegisterFunction`: Validates capacity, records sign-ups, and publishes SNS notifications.
   - `GetRegistrationsFunction`: Queries attendee tickets via EmailIndex GSI.
   - `CancelRegistrationFunction`: Deletes registration items and restores seat availability.
3. **Amazon DynamoDB:** Pay-per-request tables:
   - `EventsTable` (`eventId` HASH)
   - `RegistrationsTable` (`registrationId` HASH, `EmailIndex` GSI on `email`)
4. **Amazon SNS:** `ConfirmationTopic` publishing confirmation emails to subscribers.
5. **Amazon CloudWatch:** 14-day log group retention + `RegisterErrorRateAlarm` (triggers when error rate > 5%).
6. **GitHub Actions CI/CD:** `.github/workflows/deploy.yml` (backend SAM deployment) & `pages.yml` (frontend GitHub Pages).

---

## 🛠️ 3. Key Challenges & Technical Resolutions

| Challenge | Root Cause | Engineering Solution |
|---|---|---|
| **CORS Blocking on External APIs** | External student endpoints lacked permissive CORS headers on `POST /register`. | Implemented automatic client fallback in `app.js` to route registrations through the Hub API (`HUB_API_URL`) backend-to-backend. |
| **Metric Synchronization Discrepancy** | Registration items in DynamoDB used alias keys (`evt-101` vs `evt-001`). | Added `normalize_event_id` mapping in `list_events.py` and `app.js` to align attendee counts and seat capacity metrics 100%. |
| **Read-Only IAM Scoping in Lambda** | `ListEventsFunction` has `DynamoDBReadPolicy` (read-only), causing `put_item` attempts to fail. | Updated `list_events.py` to assign default event items **before** `put_item`, guaranteeing `200 OK` event responses even under strict IAM. |
| **Registration 404 Error** | Querying non-existent event IDs returned `404 Event does not exist`. | Enhanced `register.py` with alias lookup and automatic on-the-fly seeding of canonical default events into DynamoDB. |

---

## 🖥️ 4. Live Product Demo Walkthrough

1. **Step 1: Browse Events**
   - Open [https://geekkwame.github.io/event-registration-system-sam/](https://geekkwame.github.io/event-registration-system-sam/)
   - Default connects to **My Primary API (`us-west-1`)**, displaying *AWS Workshop Accra 2026* and *Cloud Native Kumasi Summit*.

2. **Step 2: Connect External Partner APIs**
   - Click **Gloria's API (`us-east-1`)** to load Gloria's live events.
   - Click **Dawuni's API (`us-east-1`)** to load Dawuni's live events.

3. **Step 3: Register for an Event**
   - Click **Register** on *AWS Workshop Accra 2026*.
   - Enter Name & Email ➔ Click **Confirm Registration**.
   - Confirmation toast appears; live available seats update instantly (e.g., `29 of 30 seats left`).

4. **Step 4: View & Manage Tickets**
   - Switch to **Registrations** tab to view all confirmed passes.
   - Search by email or name; click **Cancel** to revoke a ticket and restore seat capacity.

---

## ✅ 5. Final Deliverables Checklist

- [x] **1. GitHub repo with API code:** [GeekKwame/event-registration-system-sam](https://github.com/GeekKwame/event-registration-system-sam)
- [x] **2. CI/CD pipeline (GitHub Actions):** `.github/workflows/deploy.yml` & `pages.yml`
- [x] **3. Lambda functions:** `src/handlers/list_events.py`, `register.py`, `get_registrations.py`, `cancel_registration.py`
- [x] **4. DynamoDB table definitions:** `template.yaml` (`EventsTable`, `RegistrationsTable` + `EmailIndex` GSI)
- [x] **5. CloudWatch alarms config:** `template.yaml` (`RegisterErrorRateAlarm` with 5% threshold)
- [x] **6. README file:** [`README.md`](file:///c:/Users/eddie/Downloads/event-registration-system/event-registration-system/README.md) with setup instructions, architecture, and live links
- [x] **7. Product presentation:** [`docs/PROJECT_PRESENTATION.md`](file:///c:/Users/eddie/Downloads/event-registration-system/event-registration-system/docs/PROJECT_PRESENTATION.md) (this document)

# ⚡ EventPulse — Event Registration & Ticketing System

> A modern, serverless web application that replaces manual Microsoft Forms & Excel spreadsheets with automated event registration, capacity management, and instant ticket lookup on Amazon Web Services (AWS).

---

## 💡 What Problem Does This Solve? (Non-Technical Overview)

When event organizers use basic online forms and manual Excel spreadsheets, three big problems happen:
1. **Overbooking:** People keep signing up even when an event is completely full.
2. **Duplicate Registrations:** People fill out the form multiple times by mistake.
3. **Manual Overhead:** Organizers waste hours emailing attendees and updating spreadsheets.

### 🌟 How EventPulse Fixes It:
- **Automatic Capacity Control:** Once an event reaches its seat limit, new sign-ups are automatically blocked.
- **Duplicate Prevention:** Every registration checks for duplicate emails instantly.
- **Self-Service Attendee Portal:** Attendees can view their registrations and cancel anytime with a single click.
- **$0 Running Cost When Idle:** Built using AWS Serverless technology — zero monthly fees while idle!

---

## 🏛️ How It Works (Simple Analogy)

Think of EventPulse like a smart digital event center:

```
┌─────────────────┐       ┌────────────────────┐       ┌────────────────────┐
│   Web Dashboard │ ────► │  Receptionist      │ ────► │  Event Managers    │
│  (EventPulse UI)│       │  (AWS API Gateway) │       │  (AWS Lambda Code) │
└─────────────────┘       └────────────────────┘       └─────────┬──────────┘
                                                                 │
                                                                 ▼
                                                       ┌────────────────────┐
                                                       │ Digital Vault      │
                                                       │ (AWS DynamoDB)     │
                                                       └────────────────────┘
```

1. **The Web Dashboard (Frontend):** The user-friendly website where attendees browse upcoming events and sign up.
2. **The Receptionist (API Gateway):** Receives requests from the website, checks security, and routes them to the right worker.
3. **The Event Managers (Lambda Functions):** On-demand code workers (written in Python) that validate inputs, check seat limits, and save registrations.
4. **The Digital Vault (DynamoDB):** A high-speed AWS database that stores events and registration records securely.

---

## 🖥️ Live Web Dashboard (Frontend)

The repository includes a modern single-page web app located in the [`frontend/`](frontend/) directory.

### Quick Start for Non-Technical Users:
1. Open **[`frontend/index.html`](frontend/index.html)** in any web browser (Chrome, Edge, Safari).
2. Paste your live API Gateway URL in the top bar (e.g., `https://kems8drwn6.execute-api.us-west-1.amazonaws.com/dev`).
3. Click **Connect API** — you're ready to browse events, register, and manage sign-ups!

---

## 📁 Repository Structure

```text
event-registration-system/
├── template.yaml              # SAM Infrastructure-as-Code (Defines all AWS resources)
├── samconfig.toml             # Deployment settings (Stack name, region, S3 bucket)
├── frontend/                  # Web Dashboard UI
│   ├── index.html             # Main dashboard page
│   ├── style.css              # Dark Glassmorphism design system
│   ├── app.js                 # API connection & logic
│   └── README.md              # Frontend documentation
├── src/handlers/              # AWS Lambda Backend Code (Python 3.12)
│   ├── register.py            # POST /register (creates sign-up)
│   ├── list_events.py         # GET /events (lists open events)
│   ├── get_registrations.py   # GET /registrations/{email} (looks up user sign-ups)
│   ├── cancel_registration.py # DELETE /registration/{id} (cancels sign-up)
│   └── utils/response.py      # Shared CORS & JSON formatter
├── docs/                      # Architecture Diagrams & Specs
│   └── ARCHITECTURE.md        # draw.io design specs & AWS component blueprint
├── scripts/seed_events.py     # Script to populate sample events in DynamoDB
├── tests/test_handlers.py     # Automated unit tests
└── .github/workflows/deploy.yml # GitHub Actions CI/CD automation workflow
```

---

## 🛠️ Step-by-Step Deployment Guide

### Prerequisites (Install Once)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) (`aws --version`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) (`sam --version`)
- Python 3.12 (`python --version`)

### 1. Build and Deploy Backend to AWS
```bash
# 1. Build the serverless package
sam build

# 2. Deploy to AWS
sam deploy
```

### 2. Populate Sample Events
```bash
python scripts/seed_events.py events-dev
```

### 3. Test API Endpoints with `curl`
```bash
# List Events
curl https://YOUR_API_URL/events

# Register for Event
curl -X POST https://YOUR_API_URL/register \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt-001","email":"user@example.com","name":"Jane Doe"}'

# View User Registrations
curl https://YOUR_API_URL/registrations/user@example.com

# Cancel Registration
curl -X DELETE https://YOUR_API_URL/registration/REGISTRATION_ID
```

---

## ⚙️ CI/CD Automation & Testing

This project uses **GitHub Actions** (`.github/workflows/deploy.yml`):
- **On Pull Request:** Automatically installs dependencies and runs unit tests (`pytest tests/`) using `moto` (mocked AWS).
- **On Push to `main`:** Deploys code and infrastructure directly to AWS using `sam deploy`.

To configure automated GitHub deployment:
1. Go to GitHub Repo ➔ **Settings** ➔ **Secrets and variables** ➔ **Actions**.
2. Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

---

## 🧹 Cleaning Up Resources

To delete all created AWS resources cleanly:
```bash
sam delete
```

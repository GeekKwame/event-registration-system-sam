# ⚡ Event-Connect — Universal Multi-API Event Manager & Ticketing Integration Hub

> A modern, serverless web application and multi-region integration hub that enables event managers to connect to different AWS event APIs across regions, monitor live capacity, and register attendees seamlessly without building another app.

---

## 🌐 Live Web Application & API Gateways

- 🚀 **Live Web Application (GitHub Pages):**
  👉 **[https://geekkwame.github.io/event-registration-system-sam/](https://geekkwame.github.io/event-registration-system-sam/)**

- ⚡ **Connected API Gateway Endpoints:**
  - 🟢 **My Primary Hub API (`us-west-1`):** `https://kems8drwn6.execute-api.us-west-1.amazonaws.com/Prod`
  - 🟣 **Gloria's API (`us-east-1`):** `https://djabididt6.execute-api.us-east-1.amazonaws.com`
  - 🔵 **Dawuni's API (`us-east-1`):** `https://mmrq6ebalh.execute-api.us-east-1.amazonaws.com`

---

## 💡 What Problem Does This Solve? (Non-Technical Overview)

When event organizers use basic online forms and manual Excel spreadsheets, three big problems happen:
1. **Overbooking:** People keep signing up even when an event is completely full.
2. **Duplicate Registrations:** People fill out the form multiple times by mistake.
3. **Multi-System Fragmentation:** Organizations operating across different AWS regions or partner APIs cannot view or manage tickets in one unified dashboard.

### 🌟 How EventPulse Fixes It:
- **Universal Multi-API Connection:** Connect to any AWS SAM API Gateway base URL instantly with Quick-Connect preset buttons.
- **Cross-System Registration:** Sign up for local or partner events directly or through secure serverless backend routing with CORS fallbacks.
- **Automatic Capacity Control:** Once an event reaches its seat limit, new sign-ups are automatically blocked.
- **Live SNS Alerts:** Automatic confirmation emails dispatched via AWS SNS upon confirmed registration.
- **$0 Running Cost When Idle:** Built using AWS Serverless technology — zero monthly fees while idle!

---

## 🏛️ How It Works (Architecture Overview)

![AWS Serverless Event Registration Architecture Diagram](docs/architecture.png)

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

1. **Universal Web Dashboard (Frontend):** Responsive single-page web application featuring Quick-Connect API presets, live capacity progress bars, and attendee pass management.
2. **AWS API Gateway:** Secure REST API routing with CORS support and flexible stage path normalization.
3. **AWS Lambda Functions:** Python 3.12 microservices that handle event listings (`GET /events`), registrations (`POST /register`), registration lookups (`GET /registrations/{email}` & `GET /registrations/all`), and ticket cancellations (`DELETE /registration/{id}`).
4. **Amazon DynamoDB & SNS:** High-speed NoSQL database tables (`EventsTable` and `RegistrationsTable` with EmailIndex GSI) paired with SNS topic email publishing.

---

## 📁 Repository Structure

```text
event-registration-system/
├── template.yaml              # SAM Infrastructure-as-Code (Defines all AWS resources)
├── samconfig.toml             # Deployment settings (Stack name, region, S3 bucket)
├── frontend/                  # Web Dashboard UI
│   ├── index.html             # Dashboard markup with modern hero & grid
│   ├── style.css              # Glassmorphism design system & status badges
│   ├── app.js                 # API connection, CORS fallback & registration logic
│   └── README.md              # Frontend documentation
├── src/handlers/              # AWS Lambda Backend Code (Python 3.12)
│   ├── register.py            # POST /register (creates sign-up & handles provider routing)
│   ├── list_events.py         # GET /events (lists open events with registered attendee counts)
│   ├── get_registrations.py   # GET /registrations/{email} & GET /registrations/all
│   ├── cancel_registration.py # DELETE /registration/{id} (cancels sign-up)
│   └── utils/response.py      # Shared CORS & JSON response formatter
├── docs/                      # Architecture Diagrams & Specs
│   ├── ARCHITECTURE.md        # draw.io design specs & AWS component blueprint
│   └── PERSONAL_NOTES.md      # AWS CLI / SAM setup notes & troubleshooting
├── scripts/seed_events.py     # Script to populate sample events in DynamoDB
├── tests/test_handlers.py     # Automated pytest unit tests (9/9 passed)
└── .github/workflows/deploy.yml # GitHub Actions CI/CD deployment automation
```

---

## 🛠️ Step-by-Step Deployment Guide

### Prerequisites
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) (`aws --version`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) (`sam --version`)
- Python 3.12 (`python --version`)

### 1. Build and Deploy Backend to AWS
```bash
# 1. Build serverless application
sam build

# 2. Deploy stack to AWS
sam deploy
```

### 2. Run Unit Tests Locally
```bash
python -m pytest tests/
```

### 3. Test API Endpoints with `curl`
```bash
# List Events
curl https://YOUR_API_URL/events

# Register for Event
curl -X POST https://YOUR_API_URL/register \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt-001","email":"user@example.com","name":"Jane Doe"}'

# View All Registrations
curl https://YOUR_API_URL/registrations/all

# View User Registrations
curl https://YOUR_API_URL/registrations/user@example.com

# Cancel Registration
curl -X DELETE https://YOUR_API_URL/registration/REGISTRATION_ID
```

---

## ⚙️ CI/CD Automation & GitHub Actions

This repository utilizes **GitHub Actions** (`.github/workflows/deploy.yml`):
- **Continuous Integration (PR):** Installs Python 3.12 dependencies and executes unit tests (`pytest tests/`).
- **Continuous Deployment (`main`):** Automatically builds and deploys serverless updates to AWS us-west-1.
- **GitHub Pages (`pages.yml`):** Automatically builds and deploys the static frontend to GitHub Pages on every push.

---

## 🧹 Cleaning Up AWS Resources

To remove all deployed AWS infrastructure cleanly:
```bash
sam delete
```

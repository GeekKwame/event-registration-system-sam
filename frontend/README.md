# QueueLess Frontend — Serverless Web Dashboard

A modern, responsive single-page dashboard for **QueueLess**: an event registration experience that makes live capacity visible, so attendees can choose events before they fill up.

---

## 🚀 Quick Start

### 1. Open in Browser
You can open `frontend/index.html` directly in any web browser!

Or launch a local HTTP server:
```bash
# Option A: Python HTTP server
python -m http.server 8000 --directory frontend

# Option B: Node serve / live-server
npx serve frontend
```
Then visit `http://localhost:8000`.

---

## 🔗 Connecting to AWS API Gateway

### Local Testing (AWS SAM Local)
1. In your terminal, start the SAM local API server:
   ```bash
   sam local start-api
   ```
2. Open the web dashboard and enter `http://127.0.0.1:3000` in the **API Gateway Base URL** bar at the top, then click **Connect API**.

### Live AWS Deployment
1. Deploy your SAM stack:
   ```bash
   sam deploy --guided
   ```
2. Copy the `ApiUrl` output (e.g. `https://abc123xyz.execute-api.us-east-1.amazonaws.com/Prod`).
3. Paste the URL into the **API Gateway Base URL** input field on the dashboard and click **Connect API**.

---

## ⚡ Features & Endpoints Covered

| Feature | Method | API Endpoint | Description |
|---|---|---|---|
| **Browse Events** | `GET` | `/events` | Displays open events, date, capacity, and current registrations. |
| **Register Event** | `POST` | `/register` | Interactive registration modal submitting full name and email. |
| **Lookup Registrations** | `GET` | `/registrations/{email}` | Searches DynamoDB `EmailIndex` GSI for active user sign-ups. |
| **Cancel Registration** | `DELETE` | `/registration/{id}` | Deletes a registration from DynamoDB. |

---

## 🎨 Tech Stack
- **Structure:** Semantic HTML5
- **Styling:** Vanilla CSS3 (Dark Mode, Glassmorphism, CSS Variables, CSS Grid, Micro-animations)
- **Logic:** Native Modern JavaScript (Fetch API, LocalStorage, Async/Await)
- **Zero Build Step:** Runs natively in any browser with zero dependencies!

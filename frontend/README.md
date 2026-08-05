# 🎨 EventPulse Frontend — Web Dashboard Guide

> A lightweight, user-friendly web interface for browsing events, registering online, and managing registrations.

---

## 🌟 What is this? (For Non-Technical Users)

This folder contains the **website interface** for the EventPulse system. It allows non-technical users to interact with the AWS Serverless backend visually without needing to run terminal commands or code.

---

## 🚀 How to Open & Run the Dashboard

### Method 1: Direct File Open (Simplest)
1. Open your File Explorer / Finder.
2. Navigate to `event-registration-system/frontend/`.
3. Double-click **`index.html`** — it will open right in Google Chrome, Microsoft Edge, or Safari!

### Method 2: Local Web Server
If you prefer running a local server:
```bash
python -m http.server 8000 --directory frontend
```
Then open `http://localhost:8000` in your web browser.

---

## 🔗 Connecting to Your AWS API Gateway

1. When the dashboard opens, look at the top bar labeled **API Gateway Base URL**.
2. Paste your live AWS API URL:
   ```text
   https://kems8drwn6.execute-api.us-west-1.amazonaws.com/dev
   ```
3. Click **Connect API**.
4. The dashboard will automatically fetch your live events from AWS DynamoDB!

---

## 🌐 Deploying the Frontend to the Web (Free Hosting Options)

### Option 1: GitHub Pages (Recommended)
1. Go to your GitHub repository: `https://github.com/GeekKwame/event-registration-system`.
2. Click **Settings** ➔ **Pages** (on the left sidebar).
3. Under **Build and deployment**:
   - **Branch:** `main`
   - **Folder:** `/frontend`
4. Click **Save**. Within 1–2 minutes, GitHub will publish your live website URL!

### Option 2: Netlify Drag-and-Drop
1. Go to [Netlify Drop](https://app.netlify.com/drop).
2. Drag and drop the `frontend/` folder onto the page.
3. Netlify will give you a instant live HTTPS web link!

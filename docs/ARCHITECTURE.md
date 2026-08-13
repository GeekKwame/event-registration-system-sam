# System Architecture Guide

This document details the complete serverless architecture for the **Event Registration & Ticketing System**. You can use this specification to create your diagram in [draw.io](https://app.diagrams.net/).

---

## 🖼️ Official AWS Serverless Architecture Diagram

![AWS Serverless Event Registration Architecture Diagram](architecture.png)

---

## 📐 High-Level Architecture Overview

```
                          ┌──────────────────────────┐
                          │   Client / Web Frontend  │
                          └─────────────┬────────────┘
                                        │ HTTP (REST)
                                        ▼
                          ┌──────────────────────────┐
                          │     AWS API Gateway      │
                          └─────────────┬────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           │                            │                            │
           ▼                            ▼                            ▼
  POST /register                  GET /events           GET /registrations/{email}
  DELETE /registration/{id}             │                            │
           │                            │                            │
           ▼                            ▼                            ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  Register & Cancel   │    │  List Events Lambda  │    │  Get Regs Lambda     │
│   Lambda Handlers    │    └──────────┬───────────┘    └──────────┬───────────┘
└──────────┬───────────┘               │                           │
           │                           │                           │
           ▼                           ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              AWS DynamoDB                                    │
│  ┌──────────────────────────┐             ┌───────────────────────────────┐  │
│  │       Events Table       │             │      Registrations Table      │  │
│  │   (Partition: eventId)   │             │   (Partition: registrationId) │  │
│  └──────────────────────────┘             │   (GSI: EmailIndex on email)  │  │
│                                           └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
           │
           ├──────────────────────────┐
           ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│ CloudWatch Logs &   │    │  SNS Notification   │
│   Error Alarms      │───►│       Topic         │
└─────────────────────┘    └─────────────────────┘
```

---

## 🎨 Recommended Draw.io Layout & Styling Guide

When constructing this diagram in **[draw.io](https://app.diagrams.net/)**, use the official **AWS Architecture Icons** library (under `More Shapes...` -> `AWS 19` or `AWS 20`).

### 1. Group Containers (Borders & Boxes)
- **AWS Cloud Container** (Light blue dotted border): Encloses all AWS services.
- **VPC / Region Box**: Surrounds API Gateway, Lambda, DynamoDB, and CloudWatch.
- **Compute Layer Box**: Group for the 4 Lambda functions.
- **Database Layer Box**: Group for the 2 DynamoDB tables.

### 2. AWS Components & Colors

| Component | AWS Icon Name | Color Scheme / Hex | Description |
|---|---|---|---|
| **Client** | User / User Client | Steel Blue (`#232F3E`) | Web Browser, Mobile App, or Postman |
| **API Gateway** | API Gateway | Magenta (`#8C4FFF`) | REST API router with CORS enabled |
| **Lambda Functions** | AWS Lambda | Orange (`#FF9900`) | 4 handlers (Register, List, Get, Cancel) |
| **DynamoDB Tables** | Amazon DynamoDB | Blue (`#4D27AA`) | `Events` table & `Registrations` table (with GSI) |
| **CloudWatch** | Amazon CloudWatch | Dark Pink (`#E7157B`) | Logs retention & 5% Error Rate Alarm |
| **SNS Topic** | Amazon SNS | Magenta (`#CC2266`) | Confirmation emails & alarm notifications |

---

## 🔗 Connection Matrix (Edges & Arrows)

1. **Client ➔ API Gateway**
   - **Label:** `HTTPS (REST API)`
   - **Style:** Solid line, arrowhead right.

2. **API Gateway ➔ Lambda Handlers**
   - **Routes:**
     - `/register` `(POST)` ➔ `register.py`
     - `/events` `(GET)` ➔ `list_events.py`
     - `/registrations/{email}` `(GET)` ➔ `get_registrations.py`
     - `/registration/{id}` `(DELETE)` ➔ `cancel_registration.py`
   - **Style:** Solid lines with HTTP method badges.

3. **Lambda Handlers ➔ DynamoDB**
   - `register.py` ➔ Reads `EventsTable` + Writes `RegistrationsTable`
   - `list_events.py` ➔ Scans/Queries `EventsTable`
   - `get_registrations.py` ➔ Queries `EmailIndex` GSI on `RegistrationsTable`
   - `cancel_registration.py` ➔ Deletes item from `RegistrationsTable`
   - **Style:** Solid lines with operation labels (`GetItem`, `PutItem`, `Query GSI`, `DeleteItem`).

4. **Lambda Handlers ➔ CloudWatch & SNS**
   - All Lambdas ➔ CloudWatch Logs (`/aws/lambda/*`)
   - `RegisterFunction` ➔ Publishes registration confirmation event to `NotificationTopic` (SNS).
   - CloudWatch Alarm ➔ Triggers SNS when `ErrorRate > 5%`.

---

## 📁 Export Instructions for draw.io
1. Create your diagram on [draw.io](https://app.diagrams.net/).
2. Export as PNG: `File` ➔ `Export as` ➔ `PNG...`
3. Set **DPI / Zoom** to 200% for crisp high-resolution text.
4. Save the exported image to `docs/architecture.png` in this repository!

# Event-Connect frontend

Static UI for the CloudFront distribution. It talks to **same-origin `/api` paths only**. API Gateway URLs must never appear in this folder.

After a successful register, the UI shows a ticket receipt and stores it in this browser (`localStorage`). **My tickets** lists those receipts. **Find my tickets** looks up `/api/registrations/{email}`. Email from SES/SNS is optional; the on-screen ticket is the attendee record.

## Local preview (UI only)

```bash
python -m http.server 8000 --directory frontend
```

API calls to `/api` will fail until the site is served from CloudFront.

## Production publish

After `sam deploy`:

```powershell
.\scripts\sync-frontend.ps1
```

The script uploads this folder to the private S3 origin and invalidates CloudFront.

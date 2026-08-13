# Event-Connect frontend

Static UI for the CloudFront distribution. It talks to **same-origin `/api` paths only**. API Gateway URLs must never appear in this folder.

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

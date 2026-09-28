# 🚀 Production Deployment Guide
## Making pulsegrid Analytics Live for Your Team

---

## 🎯 Architecture Overview

```
Your Setup:
┌─────────────────────────────────────────────────────────┐
│  analytics.pulsegrid.fm (or dashboard.pulsegrid.fm)    │
│                                                         │
│  - Public facing login page                            │
│  - Role-based dashboards                               │
│  - Secure, isolated data                               │
│  - Auto-generated monthly reports                      │
│  - Auto-prints to your home PC                         │
└─────────────────────────────────────────────────────────┘
```

## 1. Environment Configuration (`.env.production`)
Create a `.env` file on your server based on `.env.prod.template`:

```ini
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://your-domain.com
JWT_SECRET=super_secret_long_key_here_must_be_complex
```
> ⚠️ **CRITICAL**: The app will **crash on startup** if `JWT_SECRET` is missing. This is a security feature.

## 2. Process Management (PM2)
We utilize **PM2** in fork mode (one instance) with auto-restarts.

**Start the Cluster:**
```bash
pm2 start ecosystem.config.js --env production
```

**Monitoring:**
```bash
pm2 monit       # Real-time dashboard
pm2 logs        # View application logs
pm2 list        # View status
```

**Make Persistent (Auto-start on reboot):**
```bash
pm2 save
pm2 startup
```

## 3. Security Features
*   **Helmet**: Sets secure HTTP headers (`Content-Security-Policy`, `X-Frame-Options`, etc.) to prevent XSS/Clickjacking.
*   **Rate Limiting**: Limits IP requests to 1000/hour.
*   **Env Validation**: Ensures no insecure defaults.
*   **Cors**: Strict origin checking in production.

## 4. Performance Tuning
*   **Gzip Compression**: Enabled for all responses >1KB.
*   **Caching**: In-memory caching for the heavy `/v3/artists` endpoint (5-minute TTL).
*   **Process model**: PM2 fork mode, single instance (in-process stores are not sharded).

## 5. Logging
Logs are written to the `logs/` directory:
*   `logs/error.log`: Critical failures.
*   `logs/combined.log`: All traffic.
*   Logs are JSON-formatted for easy ingestion by Datadog/Splunk.

---

## ☁️ Deploying to Clouds (Railway/DigitalOcean)
Since this is a standard Node.js app, you can deploy it easily:

**Railway/Heroku/Render:**
1.  Connect your GitHub Repo.
2.  Set Environment Variables in their dashboard.
3.  Set Start Command: `node server.js` (or use PM2 if supported).

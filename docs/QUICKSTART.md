# 🚀 5-Minute Quick Start Guide

Follow these steps to deploy the pulsegrid Intelligence Platform locally.

## 1. Setup
Make sure you are in the project root folder.

```bash
# Install strict production dependencies
npm install
```
*Note: This installs express, cors, jsonwebtoken, csv-writer, and pdfkit.*

## 2. Launch Backend (The Brain)
Start the API server. This handles authentication, database (in-memory), and AI logic.

```bash
node server.js
```
*   ✅ Server should show: `Server: http://localhost:3000`
*   ✅ Verify it's running: `curl http://localhost:3000/health`

## 3. Launch Frontend (The Interface)
Open a **new terminal tab** and serve the static files.

```bash
npx http-server . -p 8080 --cors
```
*   We use port `8080` to avoid conflicts with the API (port 3000).

## 4. Login & Operate

**Option A: The Workstation (Day-to-Day Operations)**
> http://localhost:8080/pulsegrid-frontend-connected.html

**Option B: The Terminal (Executive View)**
> http://localhost:8080/pulsegrid-terminal-dashboard.html

### Default Accounts
| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Admin** | `admin@pulsegrid.fm` | `admin123` | Full Access (All Artists, Exports, Settings) |
| **Artist** | `tours@novakin.band` | `novakin123` | Novakin Data Only |

## 5. Common Tasks

### Generate a Report
1. Login as Admin.
2. Go to `pulsegrid-terminal-dashboard.html`.
3. Click "📄 Download PDF".
4. The file will download instantly.

### Run a Marketing Campaign
1. Login as Admin.
2. Go to `pulsegrid-frontend-connected.html`.
3. Navigate to **Campaigns**.
4. Select "Social Growth" and click "Launch".

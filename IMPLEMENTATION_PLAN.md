# Cron Dashboard - Implementation Plan

## Project Goal
A web-based heads-up display for monitoring all cron jobs (system cron + OpenClaw cron), showing last run, next run, status, duration, and logs.

## Features
1. **Dashboard View**
   - List all cron jobs (system + OpenClaw)
   - Show: last run time, next run time, status (success/fail/missed), duration
   - Visual alerts: red for missed/failed, green for success
   - 7-day history

2. **Logs Button**
   - View stdout/stderr from cron runs
   - Show if notification (Telegram) was sent successfully

3. **Data Sources**
   - System cron: parse `/var/log/syslog` or cron run logs in `/tmp/`
   - OpenClaw cron: read from `/home/steve/.openclaw/cron/runs/*.jsonl`

## Tech Stack
- Simple Node.js Express server
- Vanilla HTML/CSS/JS frontend (no framework needed)
- Serve on localhost:3000

## Tasks (Priority Order)

### Phase 1: Data Collection
- [ ] Create script to parse system cron logs from /var/log/syslog
- [ ] Create script to parse OpenClaw cron runs from JSONL files
- [ ] Combine into unified data format

### Phase 2: Backend API
- [ ] Create Express server with endpoints:
  - GET /api/jobs - list all jobs with status
  - GET /api/jobs/:id/logs - get logs for specific job
  - GET /api/history - get 7-day history

### Phase 3: Frontend Dashboard
- [ ] Create HTML page with job list
- [ ] Add status indicators (green/red/yellow)
- [ ] Add "Logs" modal/popup
- [ ] Add refresh button / auto-refresh

### Phase 4: Testing & Polish
- [ ] Test with real cron data
- [ ] Add error handling
- [ ] Document how to run

## File Structure
```
cron-dashboard/
├── server.js           # Express server
├── package.json        # Dependencies
├── src/
│   ├── data.js        # Data collection (cron parsing)
│   └── api.js         # API routes
├── public/
│   ├── index.html     # Dashboard UI
│   ├── styles.css     # Styling
│   └── app.js         # Frontend logic
└── specs/
    └── SPEC.md        # This file
```

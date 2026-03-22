const express = require('express');
const path = require('path');
const { getAllJobs, getJobLogs, getRunsForDate } = require('./src/data');
const { getSystemStats, getCryptoPrices, getWeather, getBackupStatus, getServices } = require('./src/status');
const { getUmbrelStatus } = require('./src/umbrel');
const { getUmbrelContainers } = require('./src/status');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== CRON JOBS =====

// Get all jobs
app.get('/api/jobs', (req, res) => {
  try {
    const jobs = getAllJobs();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get logs for a specific job
app.get('/api/jobs/:id/logs', (req, res) => {
  try {
    const { id, type } = req.query;
    const logs = getJobLogs(id, type);
    res.json({ jobId: id, type, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get runs for a specific date (YYYY-MM-DD)
app.get('/api/runs/:date', (req, res) => {
  try {
    const { date } = req.params;
    const runs = getRunsForDate(date);
    res.json({ date, runs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== STATUS DASHBOARD =====

// Get system stats (CPU, memory, disk)
app.get('/api/status/system', (req, res) => {
  try {
    res.json(getSystemStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get crypto prices
app.get('/api/status/crypto', (req, res) => {
  try {
    res.json(getCryptoPrices());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get weather
app.get('/api/status/weather', (req, res) => {
  try {
    res.json(getWeather());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get backup status
app.get('/api/status/backups', (req, res) => {
  try {
    res.json(getBackupStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get services status
app.get('/api/status/services', (req, res) => {
  try {
    res.json(getServices());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Docker containers from Umbrel
app.get('/api/status/containers', (req, res) => {
  try {
    const containers = getUmbrelContainers();
    res.json({ containers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple cache for status (60 second TTL)
let statusCache = { data: null, timestamp: 0 };
const STATUS_CACHE_TTL = 60000; // 60 seconds

app.get('/api/status', (req, res) => {
  try {
    const now = Date.now();
    if (statusCache.data && (now - statusCache.timestamp) < STATUS_CACHE_TTL) {
      return res.json(statusCache.data);
    }
    
    const data = {
      system: getSystemStats(),
      crypto: getCryptoPrices(),
      weather: getWeather(),
      backups: getBackupStatus(),
      services: getServices(),
      timestamp: new Date().toISOString()
    };
    
    statusCache = { data, timestamp: now };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force refresh status cache
app.post('/api/status/refresh', (req, res) => {
  statusCache = { data: null, timestamp: 0 };
  res.json({ status: 'cache cleared' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== UMBREL =====

// Get Umbrel/Portainer status
app.get('/api/umbrel', (req, res) => {
  try {
    res.json(getUmbrelStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== GO TRANSIT =====

// Get GO Transit status (proxy from server side)
app.get('/api/gotransit', (req, res) => {
  try {
    const http = require('http');
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/',
      method: 'GET',
      timeout: 5000
    };
    
    const req2 = http.request(options, (res2) => {
      res.json({ status: res2.statusCode === 200 ? 'running' : 'stopped' });
    });
    
    req2.on('error', () => {
      res.json({ status: 'stopped' });
    });
    
    req2.on('timeout', () => {
      req2.destroy();
      res.json({ status: 'stopped' });
    });
    
    req2.end();
  } catch (e) {
    res.json({ status: 'stopped' });
  }
});

app.listen(PORT, () => {
  console.log(`Punchie Command Centre running at http://localhost:${PORT}`);
});

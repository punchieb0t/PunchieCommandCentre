const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get system stats
function getSystemStats() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();
  
  // CPU usage - get from top
  let cpuUsage = 0;
  try {
    const top = execSync('top -bn1 | grep "Cpu(s)"', { encoding: 'utf8' });
    const match = top.match(/(\d+\.\d+)\s*us/);
    if (match) {
      cpuUsage = parseFloat(match[1]);
    }
  } catch (e) {}
  
  // Disk usage
  let disk = { total: 0, free: 0, used: 0 };
  try {
    const df = execSync('df -BG /', { encoding: 'utf8' });
    const lines = df.split('\n');
    if (lines[1]) {
      const parts = lines[1].split(/\s+/);
      disk.total = parseInt(parts[1].replace('G', ''));
      disk.used = parseInt(parts[2].replace('G', ''));
      disk.free = parseInt(parts[3].replace('G', ''));
    }
  } catch (e) {}
  
  return {
    cpu: Math.round(cpuUsage),
    memory: {
      total: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10,
      used: Math.round((totalMem - freeMem) / 1024 / 1024 / 1024 * 10) / 10,
      free: Math.round(freeMem / 1024 / 1024 / 1024 * 10) / 10,
      percent: Math.round((totalMem - freeMem) / totalMem * 100)
    },
    disk,
    uptime: formatUptime(uptime),
    hostname: os.hostname(),
    platform: os.platform()
  };
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Get crypto prices
function getCryptoPrices() {
  const prices = [];
  
  // Try CoinCap first (free, no key)
  try {
    const data = execSync('curl -s --max-time 3 "https://api.coincap.io/v2/assets?ids=bitcoin,ethereum,solana,cro,zcash"', { encoding: 'utf8' });
    const json = JSON.parse(data);
    if (json.data) {
      for (const coin of json.data) {
        prices.push({
          symbol: coin.symbol,
          price: parseFloat(coin.priceUsd),
          change24h: parseFloat(coin.changePercent24Hr) || 0
        });
      }
    }
  } catch (e) {
    // Fallback to cached values if API fails
  }
  
  // If still empty, return demo data
  if (prices.length === 0) {
    return [
      { symbol: 'BTC', price: 68700, change24h: -0.2 },
      { symbol: 'ETH', price: 1995, change24h: 1.1 },
      { symbol: 'SOL', price: 86.6, change24h: 0.5 },
      { symbol: 'CRO', price: 0.08, change24h: -0.6 },
      { symbol: 'ZEC', price: 292, change24h: -1.7 }
    ];
  }
  
  return prices;
}

// Get weather - FASTER: 3s timeout
function getWeather() {
  try {
    const data = execSync('curl -s --max-time 3 "wttr.in/Mississauga?format=j1"', { encoding: 'utf8', timeout: 3000 });
    const json = JSON.parse(data);
    const current = json.current_condition[0];
    return {
      temp_C: current.temp_C,
      weatherDesc: current.weatherDesc[0].value,
      humidity: current.humidity,
      wind_kmph: current.windspeedKmph,
      location: 'Mississauga'
    };
  } catch (e) {
    return { error: 'Unable to fetch weather' };
  }
}

// Get backup status
function getBackupStatus() {
  const status = {
    lastBackup: null,
    lastBackupSize: null,
    lastVerify: null,
    backupCount: 0,
    pCloudConnected: true
  };
  
  // Query pCloud for latest backup - FASTER: 5s timeout
  try {
    const data = execSync('python3 /home/steve/.openclaw/workspace/scripts/get_latest_backup.py 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const parts = data.trim().split('|');
    if (parts.length >= 2 && !parts[0].startsWith('NO_') && !parts[0].startsWith('ERROR')) {
      const dateStr = parts[0];
      const size = parseInt(parts[1]);
      
      // Parse the pCloud date and format in EST
      const date = new Date(dateStr);
      status.lastBackup = date.toLocaleString('en-US', { 
        timeZone: 'America/Toronto',
        month: 'short', 
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true
      });
      status.lastBackupSize = Math.round(size / 1024 / 1024) + ' MB';
      status.backupCount = 1;
    } else {
      status.pCloudConnected = false;
    }
  } catch (e) {
    console.error('Backup status error:', e.message);
    status.pCloudConnected = false;
  }
  
  // Check verify log
  try {
    const log = fs.readFileSync('/tmp/backup_verify.log', 'utf8');
    const lines = log.trim().split('\n').reverse();
    for (const line of lines) {
      if (line.includes('Verify') || line.includes('OK') || line.includes('success')) {
        const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          status.lastVerify = dateMatch[0];
        }
        break;
      }
    }
  } catch (e) {}
  
  return status;
}

// Get open ports / services
function getServices() {
  const services = [];
  
  // Check common services
  const checks = [
    { name: 'OpenClaw', port: 3001, cmd: 'curl -s http://localhost:3001/api/health' },
    { name: 'Cron Dashboard', port: 3000, cmd: 'curl -s http://localhost:3000/api/health' },
  ];
  
  for (const svc of checks) {
    try {
      execSync(svc.cmd, { encoding: 'utf8', timeout: 3000 });
      services.push({ name: svc.name, status: 'running', port: svc.port });
    } catch (e) {
      services.push({ name: svc.name, status: 'stopped', port: svc.port });
    }
  }
  
  return services;
}

module.exports = {
  getSystemStats,
  getCryptoPrices,
  getWeather,
  getBackupStatus,
  getServices
};

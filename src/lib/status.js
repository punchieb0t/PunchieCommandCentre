const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();
  
  let cpuUsage = 0;
  try {
    const top = execSync('top -bn1 | grep "Cpu(s)"', { encoding: 'utf8' });
    const match = top.match(/(\d+\.\d+)\s*us/);
    if (match) {
      cpuUsage = parseFloat(match[1]);
    }
  } catch (e) {}
  
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

function getCryptoPrices() {
  const prices = [];
  const API_KEY = 'CG-c6WGoGzmqsuji9KpLk3d83kE';
  
  // Use CoinGecko API with key
  try {
    const data = execSync(`curl -s --max-time 5 "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cronos,zcash&vs_currencies=usd&include_24hr_change=true&x_cg_demo_api_key=${API_KEY}"`, { encoding: 'utf8' });
    const json = JSON.parse(data);
    
    const symbolMap = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', cronos: 'CRO', zcash: 'ZEC' };
    
    for (const [id, info] of Object.entries(json)) {
      if (info.usd) {
        prices.push({
          symbol: symbolMap[id] || id.toUpperCase(),
          price: info.usd,
          change24h: info.usd_24h_change || 0
        });
      }
    }
  } catch (e) {
    console.error('Crypto API error:', e.message);
  }
  
  // Fallback
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

function getBackupStatus() {
  const status = {
    lastBackup: null,
    lastBackupSize: null,
    lastVerify: null,
    backupCount: 0,
    pCloudConnected: true
  };
  
  try {
    const data = execSync('python3 /home/steve/.openclaw/workspace/scripts/get_latest_backup.py 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const parts = data.trim().split('|');
    if (parts.length >= 2 && !parts[0].startsWith('NO_') && !parts[0].startsWith('ERROR')) {
      const dateStr = parts[0];
      const size = parseInt(parts[1]);
      
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
    status.pCloudConnected = false;
  }
  
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

function getServices() {
  const services = [];
  
  const checks = [
    { name: 'Umbrel (Pi)', ip: '10.0.0.147', port: null, cmd: 'ssh -o ConnectTimeout=3 umbrel@10.0.0.147 "echo ok" 2>/dev/null' },
    { name: 'GO Transit', ip: '10.0.0.115', port: 3001, cmd: 'curl -s http://10.0.0.115:3001 --max-time 3' },
  ];
  
  for (const svc of checks) {
    try {
      execSync(svc.cmd, { encoding: 'utf8', timeout: 5000 });
      services.push({ name: svc.name, status: 'running', ip: svc.ip, port: svc.port });
    } catch (e) {
      services.push({ name: svc.name, status: 'stopped', ip: svc.ip, port: svc.port });
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

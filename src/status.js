const { execSync } = require('child_process');
const fs = require('fs');

function getSystemStats() {
  try {
    const cpu = execSync("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'", { encoding: 'utf8' });
    
    // Get memory: used and total in MB
    const memCmd = execSync("free -m | awk 'NR==2{printf \"%d|%d\", $3, $2}'", { encoding: 'utf8' });
    const memParts = memCmd.trim().split('|');
    const memUsed = parseInt(memParts[0]) || 0;
    const memTotal = parseInt(memParts[1]) || 1;
    const memPercent = Math.round(memUsed * 100 / memTotal);
    
    const disk = execSync("df -h / | awk 'NR==2{print $5}' | sed 's/%//'", { encoding: 'utf8' });
    
    return {
      cpu: parseFloat(cpu.trim()) || 0,
      memory: {
        total: memTotal,
        used: memUsed,
        percent: memPercent
      },
      disk: parseInt(disk.trim()) || 0
    };
  } catch (e) {
    return { cpu: 0, memory: { percent: 0 }, disk: 0 };
  }
}

function getCryptoPrices() {
  const prices = {};
  const tickers = ['bitcoin', 'ethereum', 'solana', 'zcash', 'cronos'];
  
  for (const ticker of tickers) {
    try {
      const data = execSync(`curl -s "https://api.coingecko.com/api/v3/simple/price?ids=${ticker}&vs_currencies=usd"`, { encoding: 'utf8', timeout: 5000 });
      const parsed = JSON.parse(data);
      prices[ticker] = parsed[ticker]?.usd || 0;
    } catch (e) {
      prices[ticker] = 0;
    }
  }
  
  return prices;
}

function getWeather() {
  try {
    const data = execSync('curl -s "wttr.in/Toronto?format=j1"', { encoding: 'utf8', timeout: 5000 });
    const parsed = JSON.parse(data);
    const current = parsed.current_condition[0];
    return {
      temp: parseInt(current.temp_C),
      condition: current.weatherDesc[0].value,
      humidity: parseInt(current.humidity)
    };
  } catch (e) {
    return { temp: 0, condition: 'Unknown', humidity: 0 };
  }
}

function getBackupStatus() {
  try {
    const content = fs.readFileSync('/tmp/backup_cron.log', 'utf8');
    const lines = content.trim().split('\n').reverse(); // Reverse to find last actual line
    let lastBackupLine = '';
    // First try to find SUCCESS
    for (const line of lines) {
      if (line.toLowerCase().includes('success') || line.toLowerCase().includes('complete')) {
        lastBackupLine = line;
        break;
      }
    }
    // If no success line, use any backup end line
    if (!lastBackupLine) {
      for (const line of lines) {
        if (line.includes('BACKUP END')) {
          lastBackupLine = line;
          break;
        }
      }
    }
    const match = lastBackupLine.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    return {
      last: match ? match[1] : null,
      success: lastBackupLine.toLowerCase().includes('success') || lastBackupLine.toLowerCase().includes('complete')
    };
  } catch (e) {
    return { last: null, success: false };
  }
}

function getServices() {
  const services = [];
  
  const checks = [
    { name: 'Umbrel (Pi)', ip: '10.0.0.147', port: null, cmd: 'ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no umbrel@10.0.0.147 "echo ok" 2>/dev/null' },
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

function getUmbrelContainers() {
  try {
    const cmd = `ssh -o ConnectTimeout=5 umbrel@10.0.0.147 'docker ps --format "{{.Names}}|{{.Status}}|{{.Image}}"'`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
    
    const containers = output.trim().split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split('|');
        return { name: parts[0], status: parts[1], image: parts[2] };
      });
    
    return containers;
  } catch (e) {
    console.error('Error getting containers:', e.message);
    return [];
  }
}

module.exports = {
  getSystemStats,
  getCryptoPrices,
  getWeather,
  getBackupStatus,
  getServices,
  getUmbrelContainers
};

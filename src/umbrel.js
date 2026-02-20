// Get Umbrel/Portainer status via SSH
const { execSync } = require('child_process');

function getUmbrelStatus() {
  const status = {
    umbrelOnline: false,
    ip: '10.0.0.147',
    containers: [],
    error: null
  };
  
  // Check if Umbrel is reachable
  try {
    execSync('ping -c 1 -W 2 10.0.0.147 > /dev/null 2>&1', { encoding: 'utf8' });
    status.umbrelOnline = true;
  } catch (e) {
    status.umbrelOnline = false;
    status.error = 'Umbrel not reachable';
    return status;
  }
  
  // Get containers via SSH
  try {
    const cmd = "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 umbrel@10.0.0.147 'docker ps --format \"{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}\"' 2>/dev/null";
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    
    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('|');
      if (parts.length >= 4) {
        const name = parts[0];
        // Skip only system containers (auth, tor_proxy, dind)
        if (name === 'auth' || name === 'tor_proxy' || name.includes('dind')) continue;
        
        status.containers.push({
          name: name.substring(0, 35),
          image: parts[1].substring(0, 30),
          state: parts[2].toLowerCase(),
          status: parts[3]
        });
      }
    }
  } catch (e) {
    status.error = 'Failed: ' + e.message;
  }
  
  return status;
}

module.exports = {
  getUmbrelStatus
};

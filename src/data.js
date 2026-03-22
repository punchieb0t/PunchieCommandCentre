const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cronParser = require('cron-parser');

const { CronExpressionParser } = require('cron-parser');

// Cache for openclaw cron list (5 second TTL)
let openclawCache = { data: null, timestamp: 0 };
const OPENCLAW_CACHE_TTL = 5000; // 5 seconds

// Get next run time for a cron expression
function getNextRun(schedule) {
  try {
    // Try parsing with cron-parser first (handles most cases including ranges)
    const interval = CronExpressionParser.parse(schedule, {
      tz: 'America/Toronto'
    });
    const next = interval.next().toDate();
    return next.toLocaleString('en-US', { 
      timeZone: 'America/Toronto',
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    // Fallback: if parsing fails, return 'N/A'
    return 'N/A';
  }
}

// Parse system crontab - THE SOURCE OF TRUTH
function getSystemCrontabJobs() {
  const jobs = [];
  
  try {
    // Get directly from crontab command
    const output = execSync('crontab -l', { encoding: 'utf8' });
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('CRON_TZ')) {
        continue;
      }
      
      // Parse: schedule command
      const match = trimmed.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
      if (match) {
        const schedule = match[1];
        const cmd = match[2].trim();
        
        jobs.push({
          id: `cron_${Buffer.from(cmd).toString('base64').slice(0, 8)}`,
          name: getJobName(cmd),
          type: 'scheduled',  // Changed from 'system-crontab' - more intuitive
          status: 'scheduled',  // Yellow dot = scheduled to run
          enabled: true,
          schedule,
          command: cmd,
          nextRun: getNextRun(schedule),
          lastRun: null,
          lastStatus: 'scheduled',
          runCount: 0,
          runs: []
        });
      }
    }
    
  } catch (err) {
    console.error('Error reading crontab:', err.message);
  }
  
  return jobs;
}

// Get job runs from syslog - grep for steve CRON entries (faster than reading whole file)
function getJobRunsFromSyslog() {
  const runsMap = new Map();
  
  try {
    // Use grep with -m to limit results early - much faster than scanning whole file
    // Also use zgrep for compressed logs and limit to last 200 matches
    const output = execSync('grep -m 200 "CRON.*steve" /var/log/syslog /var/log/syslog.1 2>/dev/null | tail -200', { encoding: 'utf8', timeout: 3000 });
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Strip file prefix if present (e.g., "/var/log/syslog:")
      const cleanLine = line.replace(/^\/var\/log\/syslog(\.\d+)?:/, '');
      
      // Match: "2026-02-17T03:00:01 steve CRON[12345]: (steve) CMD (...)"
      const match = cleanLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^ ]*)\s+steve\s+CRON\[\d+\]:\s+\(steve\)\s+CMD\s+\((.+)\)/);
      if (match) {
        const [, timestamp, cmd] = match;
        
        // Normalize command for matching
        const cmdShort = cmd.replace(/^\/home\/steve\/.openclaw\/workspace\/scripts\//, '')
                           .replace(/^\/home\/steve\/.npm-global\/bin\//, '')
                           .replace(/\s>>.*$/, '')
                           .replace(/\s2>&1$/, '');
        
        if (!runsMap.has(cmdShort)) {
          runsMap.set(cmdShort, []);
        }
        runsMap.get(cmdShort).push({
          timestamp,
          command: cmd,
          raw: line
        });
      }
    }
    
  } catch (err) {
    // No matches is fine
  }
  
  return runsMap;
}

// NEW: Get runs for a specific date
function getRunsForDate(dateStr) {
  // dateStr format: YYYY-MM-DD
  const runsMap = getJobRunsFromSyslog();
  const runsForDate = [];
  
  for (const [cmd, runs] of runsMap.entries()) {
    for (const run of runs) {
      const runDate = run.timestamp.split('T')[0]; // Get YYYY-MM-DD from ISO timestamp
      if (runDate === dateStr) {
        runsForDate.push({
          cmd,
          timestamp: run.timestamp,
          command: run.command,
          raw: run.raw
        });
      }
    }
  }
  
  // Sort by timestamp descending
  runsForDate.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return runsForDate;
}

// Check log file for success/failure
function checkJobStatus(cmdShort) {
  const logMap = {
    'backup_to_pcloud.sh': '/tmp/backup_cron.log',
    'verify_backup.sh': '/tmp/backup_verify.log',
    'send_morning_briefing.sh': '/tmp/morning_briefing.log',
    'tibiadrome_reminder.sh': '/tmp/tibiadrome_reminder.log',
    'tibiagoals_reminder.sh': '/tmp/tibiagoals_reminder.log',
    'minimax_usage.py': '/tmp/minimax_usage.log',
    'security_audit.sh': '/tmp/security_audit.log',
    'double_exp_reminder.sh': '/tmp/double_exp_reminder.log',
    'Team hunt': '/tmp/team_hunt.log',
    'gog auth': '/tmp/gog_auth.log'
  };
  
  for (const [key, logFile] of Object.entries(logMap)) {
    if (cmdShort.includes(key)) {
      try {
        if (fs.existsSync(logFile)) {
          const content = fs.readFileSync(logFile, 'utf8');
          const lines = content.trim().split('\n').filter(l => l.trim());
          const lastLine = lines[lines.length - 1] || '';
          
          // Check for errors
          if (lastLine.toLowerCase().includes('error') || 
              lastLine.toLowerCase().includes('failed') ||
              lastLine.toLowerCase().includes('exception')) {
            return 'failed';
          }
          return 'ok';
        }
      } catch (e) {}
    }
  }
  return 'unknown';
}

// Map commands to readable names
function getJobName(cmd) {
  const nameMap = {
    'backup_wrapper.sh': 'Backup to pCloud',
    'cleanup_old_backups.sh': 'Backup Cleanup Log',
    'verify_wrapper.sh': 'Verify Backup',
    'send_morning_briefing.sh': 'Morning Briefing',
    'morning_prep.sh': 'Morning Prep',
    'check_briefing.sh': 'Check Briefing Sent',
    'go_transit_morning.sh': 'GO Transit Morning Delay Check',
    'tibiadrome_wrapper.sh': 'TibiaDrome Reminder',
    'tibiagoals_wrapper.sh': 'TibiaGoals Reminder',
    'team_hunt_wrapper.sh': 'Team Hunt Reminder',
    'daily_review_wrapper.sh': 'Daily Review',
    'weekly_review_wrapper.sh': 'Weekly Review',
    'minimax_wrapper.sh': 'Minimax Usage Report',
    'security_audit_wrapper.sh': 'Security Audit',
    'double_exp_wrapper.sh': 'Double Exp Reminder',
    'sync_agents_pcloud.sh': 'Sync Agents to pCloud',
    'olympics_canada_monitor.py': 'Olympics Canada Monitor',
    'cron_monitor': 'Cron Alive Monitor',
    'portainer_dind_monitor.py': 'Portainer DinD Monitor',
    'metrolinx_tracker.py': 'GO Transit Delay Check',
    'olympics_alert_system.py': 'Olympic Brief'
  };
  
  for (const [key, name] of Object.entries(nameMap)) {
    if (cmd.includes(key)) return name;
  }
  
  // Humanize remaining names: convert underscores/hyphens to spaces, title case
  let cleaned = cmd.replace(/^.*\//, '').replace(/\s>>.*$/, '').replace(/\s2>&1$/, '');
  // Remove .sh, .py extensions
  cleaned = cleaned.replace(/\.(sh|py)$/, '');
  // Replace underscores/hyphens with spaces
  cleaned = cleaned.replace(/[_-]/g, ' ');
  // Title case first letter of each word
  cleaned = cleaned.replace(/\b\w/g, l => l.toUpperCase());
  
  return cleaned.slice(0, 40);
}

// Get OpenClaw cron jobs
function getOpenClawJobs() {
  const jobs = [];
  
  // Helper to convert cron to human readable
  const cronToHuman = (expr) => {
    if (!expr) return 'N/A';
    if (expr.includes('*/')) {
      const parts = expr.trim().split(/\s+/);
      if (parts[0].startsWith('*/')) return `Every ${parseInt(parts[0].slice(2))} min`;
      if (parts[1]?.startsWith('*/')) return `Every ${parseInt(parts[1].slice(2))}h`;
    }
    if (expr.match(/^0\s+\*\s+\*\s+\*\s+\*$/)) return 'Every hour';
    if (expr.match(/^0\s+0\s+\*\s+\*\s+\*$/)) return 'Daily midnight';
    if (expr.match(/^\d+\s+\d+\s+\*\s+\*\s+\d+$/)) {
      // Specific times - convert to 12hr
      const parts = expr.split(/\s+/);
      let [min, hour, , , dow] = parts;
      let h = parseInt(hour);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
      const timeStr = `${h12}:${min.padStart(2, '0')} ${period}`;
      let daysStr = '';
      if (dow === '*') daysStr = 'Daily';
      else if (dow === '1-5') daysStr = 'Mon-Fri';
      else if (dow === '0,6' || dow === '6,0') daysStr = 'Weekends';
      else {
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        if (dow.includes(',')) daysStr = dow.split(',').map(d => names[parseInt(d)] || d).join(', ');
        else daysStr = names[parseInt(dow)] || dow;
      }
      return `${timeStr} · ${daysStr}`;
    }
    return expr;
  };
  
  // Name fixups
  let data;
  const nameFixups = {
    'Multi-chain Wallet Monitor': '💰 Multi-chain Wallet Monitor',
    'Run: python3 ~/.openclaw/workspace/star-office-ui/update_star_office.py': '⭐ Star Office Updater',
  };
  
  // Use cache to avoid hitting openclaw every time
  const now = Date.now();
  if (openclawCache.data && (now - openclawCache.timestamp) < OPENCLAW_CACHE_TTL) {
    data = openclawCache.data;
  } else {
    try {
      const output = execSync('openclaw cron list --json 2>/dev/null', { encoding: 'utf8', timeout: 8000 });
      openclawCache = { data: JSON.parse(output), timestamp: now };
      data = openclawCache.data;
    } catch (e) {
      console.error('Error fetching OpenClaw jobs:', e.message);
      return jobs;
    }
  }
  
  for (const job of data.jobs || []) {
      let name = job.name || 'Unnamed Job';
      for (const [k, v] of Object.entries(nameFixups)) {
        if (name.includes(k) || (job.payload?.message || '').includes(k)) {
          name = v;
          break;
        }
      }
      
      // Get schedule - convert to human readable
      let schedule = 'N/A';
      if (job.schedule?.kind === 'cron') {
        schedule = cronToHuman(job.schedule.expr || '');
      } else if (job.schedule?.kind === 'every') {
        const ms = job.schedule.everyMs || 0;
        schedule = ms >= 3600000 ? `Every ${Math.round(ms/3600000)}h` : `Every ${Math.round(ms/60000)}m`;
      } else if (job.schedule?.kind === 'at') {
        schedule = new Date(job.schedule.at).toLocaleString('en-US', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
      }
      
      jobs.push({
        id: job.id,
        name,
        type: 'openclaw',
        status: job.state?.lastStatus || 'unknown',
        enabled: job.enabled,
        schedule,
        command: job.payload?.message?.substring(0, 100) || job.payload?.text || 'agentTurn',
        nextRun: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toLocaleString('en-US', { 
          timeZone: 'America/Toronto',
          weekday: 'short',
          month: 'short', 
          day: 'numeric',
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true
        }) : 'N/A',
        lastRun: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toLocaleString('en-US', { 
          timeZone: 'America/Toronto',
          weekday: 'short',
          month: 'short', 
          day: 'numeric',
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true
        }) : 'never',
        lastStatus: job.state?.lastStatus || 'unknown',
        runCount: job.state?.runCount || 0,
        runs: []
      });
    }
  } catch (err) {
    console.error('Error fetching OpenClaw jobs:', err.message);
  }
  
  return jobs;
}

// Get all jobs - reads from SYSTEM CRONTAB + OPENCLAW
function getAllJobs() {
  let jobs = getSystemCrontabJobs();
  const runsMap = getJobRunsFromSyslog();
  
  // Add OpenClaw cron jobs
  const openclowJobs = getOpenClawJobs();
  jobs = [...jobs, ...openclowJobs];
  
  // Merge runs into jobs
  for (const job of jobs) {
    const cmdShort = job.command
      .replace(/^\/home\/steve\/.openclaw\/workspace\/scripts\//, '')
      .replace(/^\/home\/steve\/.npm-global\/bin\//, '')
      .replace(/\s>>.*$/, '')
      .replace(/\s2>&1$/, '');
    
    const runs = runsMap.get(cmdShort) || [];
    if (runs.length > 0) {
      // Sort by most recent
      runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      job.lastRun = runs[0].timestamp;
      job.runCount = runs.length;
      // Check actual log for status
      job.lastStatus = checkJobStatus(cmdShort);
      job.status = job.lastStatus;
      job.runs = runs.slice(0, 20).map(r => ({
        timestamp: r.timestamp,
        status: checkJobStatus(cmdShort),
        summary: job.name,
        command: r.command
      }));
    } else {
      // Check if there's a log file even without syslog entry
      job.lastStatus = checkJobStatus(cmdShort);
      job.status = job.lastStatus;
      job.runs = [];
    }
  }
  
  const enabled = jobs.filter(j => j.enabled).length;
  const disabled = jobs.filter(j => !j.enabled).length;
  
  // Find next scheduled run
  const nextScheduled = jobs
    .filter(j => j.enabled && j.nextRun !== 'N/A')
    .sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun))[0]?.nextRun || 'N/A';
  
  return {
    system: jobs,
    summary: {
      total: jobs.length,
      enabled,
      disabled,
      totalRuns: jobs.reduce((sum, j) => sum + j.runCount, 0),
      nextScheduledRun: nextScheduled
    }
  };
}

// Get logs for a specific job
function getJobLogs(jobId, type) {
  const runsMap = getJobRunsFromSyslog();
  
  // Find matching runs
  for (const [cmdShort, runs] of runsMap.entries()) {
    const jobCmdShort = cmdShort; // This is already shortened
    if (cmdShort.includes(jobId) || jobId.includes(cmdShort.slice(-8))) {
      return runs.map(r => ({
        timestamp: r.timestamp,
        status: 'ok',
        summary: cmdShort
      }));
    }
  }
  
  return [];
}

// Health check
function getCronHealth() {
  const jobs = getSystemCrontabJobs();
  const issues = [];
  const now = new Date();
  
  for (const job of jobs) {
    if (!job.enabled) continue;
    
    if (job.lastRun) {
      const lastRunTime = new Date(job.lastRun);
      const hoursSinceRun = (now - lastRunTime) / (1000 * 60 * 60);
      
      // Check if overdue (rough heuristic)
      const isDaily = job.schedule.includes('* * * *');
      if (isDaily && hoursSinceRun > 36) {
        issues.push(`${job.name}: Last ran ${Math.round(hoursSinceRun)}h ago, may be overdue`);
      }
    } else if (job.runCount === 0) {
      issues.push(`${job.name}: Never run yet`);
    }
  }
  
  return {
    healthy: issues.length === 0,
    issues,
    jobCount: jobs.length,
    enabledCount: jobs.filter(j => j.enabled).length
  };
}

module.exports = {
  getAllJobs,
  getJobLogs,
  getSystemCrontabJobs,
  getCronHealth,
  getJobRunsFromSyslog,
  getRunsForDate,
  checkJobStatus
};

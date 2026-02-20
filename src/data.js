const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cronParser = require('cron-parser');

const { CronExpressionParser } = require('cron-parser');

// Get next run time for a cron expression
function getNextRun(schedule) {
  try {
    const interval = CronExpressionParser.parse(schedule);
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
    // Use grep to filter - much faster than reading entire file
    const output = execSync('grep "CRON.*steve" /var/log/syslog /var/log/syslog.1 2>/dev/null | tail -100', { encoding: 'utf8' });
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
    'verify_wrapper.sh': 'Verify Backup',
    'send_morning_briefing.sh': 'Morning Briefing',
    'morning_prep.sh': 'Morning Prep',
    'check_briefing.sh': 'Check Briefing Sent',
    'go_transit_morning.sh': 'GO Transit Morning',
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
    'cron_monitor': 'Cron Alive Monitor'
  };
  
  for (const [key, name] of Object.entries(nameMap)) {
    if (cmd.includes(key)) return name;
  }
  
  return cmd.replace(/^.*\//, '').replace(/\s>>.*$/, '').replace(/\s2>&1$/, '').slice(0, 40);
}

// Get all jobs - reads from SYSTEM CRONTAB only
function getAllJobs() {
  let jobs = getSystemCrontabJobs();
  const runsMap = getJobRunsFromSyslog();
  
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
  checkJobStatus
};

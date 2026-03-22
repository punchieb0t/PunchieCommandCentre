const fs = require('fs');
const { execSync } = require('child_process');
const cronParser = require('cron-parser');

// Get next run time for a cron expression
function getNextRun(schedule) {
  try {
    const interval = cronParser.parseExpression(schedule);
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
    const output = execSync('crontab -l', { encoding: 'utf8' });
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('CRON_TZ')) {
        continue;
      }
      
      const match = trimmed.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
      if (match) {
        const schedule = match[1];
        const cmd = match[2].trim();
        
        jobs.push({
          id: `cron_${Buffer.from(cmd).toString('base64').slice(0, 8)}`,
          name: getJobName(cmd),
          type: 'scheduled',
          status: 'scheduled',
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

function getJobRunsFromSyslog() {
  const runsMap = new Map();
  
  try {
    const output = execSync('grep "CRON.*steve" /var/log/syslog /var/log/syslog.1 2>/dev/null | tail -100', { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const cleanLine = line.replace(/^\/var\/log\/syslog(\.\d+)?:/, '');
      const match = cleanLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^ ]*)\s+steve\s+CRON\[\d+\]:\s+\(steve\)\s+CMD\s+\((.+)\)/);
      if (match) {
        const [, timestamp, cmd] = match;
        
        const cmdShort = cmd.replace(/^\/home\/steve\/.openclaw\/workspace\/scripts\//, '')
                           .replace(/^\/home\/steve\/.npm-global\/bin\//, '')
                           .replace(/\s>>.*$/, '')
                           .replace(/\s2>&1$/, '');
        
        if (!runsMap.has(cmdShort)) {
          runsMap.set(cmdShort, []);
        }
        runsMap.get(cmdShort).push({ timestamp, command: cmd, raw: line });
      }
    }
    
  } catch (err) {}
  
  return runsMap;
}

function checkJobStatus(cmdShort, lastRunTimestamp, runCount, schedule) {
  // First check for explicit failures in logs
  const logMap = {
    'backup_to_pcloud.sh': '/tmp/backup_cron.log',
    'backup_wrapper.sh': '/tmp/backup_cron.log',
    'verify_backup.sh': '/tmp/backup_verify.log',
    'verify_wrapper.sh': '/tmp/backup_verify.log',
    'send_morning_briefing.sh': '/tmp/morning_briefing.log',
    'tibiadrome_reminder.sh': '/tmp/tibiadrome_reminder.log',
    'tibiadrome_wrapper.sh': '/tmp/tibiadrome_reminder.log',
    'tibiagoals_reminder.sh': '/tmp/tibiagoals_reminder.log',
    'tibiagoals_wrapper.sh': '/tmp/tibiagoals_reminder.log',
    'minimax_usage.py': '/tmp/minimax_usage.log',
    'minimax_wrapper.sh': '/tmp/minimax_usage.log',
    'security_audit.sh': '/tmp/security_audit.log',
    'security_audit_wrapper.sh': '/tmp/security_audit.log',
    'double_exp_reminder.sh': '/tmp/double_exp_reminder.log',
    'double_exp_wrapper.sh': '/tmp/double_exp_reminder.log',
    'Team hunt': '/tmp/team_hunt.log',
    'team_hunt_wrapper.sh': '/tmp/team_hunt.log',
    'gog auth': '/tmp/gog_auth.log',
    'sync_agents': '/tmp/sync_agents.log',
    'sync_agents_pcloud.sh': '/tmp/sync_agents.log',
    'sync_agents_wrapper.sh': '/tmp/sync_agents.log',
    'morning_prep': '/tmp/morning_prep.log',
    'morning_prep.sh': '/tmp/morning_prep.log',
    'check_briefing': '/tmp/check_briefing.log',
    'check_briefing.sh': '/tmp/check_briefing.log',
    'daily_review': '/tmp/daily_review.log',
    'daily_review_wrapper.sh': '/tmp/daily_review.log',
    'weekly_review': '/tmp/weekly_review.log',
    'weekly_review_wrapper.sh': '/tmp/weekly_review.log',
    'olympics': '/tmp/olympics_monitor.log',
    'olympics_canada_monitor.py': '/tmp/olympics_monitor.log',
    'go_transit': '/tmp/go_transit_morning.log',
    'go_transit_morning.sh': '/tmp/go_transit_morning.log',
    'cron_monitor': '/tmp/cron_monitor.log',
  };
  
  // Check log for failures first
  for (const [key, logFile] of Object.entries(logMap)) {
    if (cmdShort.includes(key)) {
      try {
        if (fs.existsSync(logFile)) {
          const content = fs.readFileSync(logFile, 'utf8');
          const lines = content.trim().split('\n').filter(l => l.trim());
          const lastLine = lines[lines.length - 1] || '';
          
          if (lastLine.toLowerCase().includes('error') || 
              lastLine.toLowerCase().includes('failed') ||
              lastLine.toLowerCase().includes('exception') ||
              lastLine.toLowerCase().includes('could not send')) {
            return 'failed';
          }
        }
      } catch (e) {}
    }
  }
  
  // Check if never run
  if (!runCount || runCount === 0) {
    return 'never';
  }
  
  // Get current time and day of week in EST
  const now = new Date();
  const estOffset = -5 * 60 * 60 * 1000;
  const estTime = new Date(now.getTime() + estOffset);
  const todayStr = estTime.toISOString().split('T')[0];
  const todayDay = estTime.getDay(); // 0=Sun, 6=Sat
  
  // Parse schedule to see if job runs today
  const parts = schedule.split(' ');
  if (parts.length >= 5) {
    const dayOfWeek = parts[4];
    
    // Job doesn't run today
    if (dayOfWeek !== '*') {
      const daysToRun = [];
      if (dayOfWeek.includes(',')) {
        dayOfWeek.split(',').forEach(d => daysToRun.push(parseInt(d)));
      } else if (dayOfWeek.includes('-')) {
        const [start, end] = dayOfWeek.split('-').map(Number);
        for (let i = start; i <= end; i++) daysToRun.push(i);
      } else {
        daysToRun.push(parseInt(dayOfWeek));
      }
      
      if (!daysToRun.includes(todayDay)) {
        return 'idle'; // Not scheduled for today
      }
    }
  }
  
  // Check if ran today
  if (lastRunTimestamp) {
    const runDate = lastRunTimestamp.split('T')[0];
    if (runDate === todayStr) {
      return 'done'; // Already ran today
    }
  }
  
  // Scheduled for today but hasn't run yet
  return 'scheduled';
}

function getJobName(cmd) {
  // Map commands to readable names
  const nameMap = {
    'backup_to_pcloud.sh': '💾 Backup to pCloud',
    'backup_wrapper.sh': '💾 Backup to pCloud',
    'verify_backup.sh': '✅ Verify Backup',
    'verify_wrapper.sh': '✅ Verify Backup',
    'send_morning_briefing.sh': '🌅 Morning Briefing',
    'tibiadrome_reminder.sh': '🎮 TibiaDrome Reminder',
    'tibiadrome_wrapper.sh': '🎮 TibiaDrome Reminder',
    'tibiagoals_reminder.sh': '🎯 TibiaGoals Reminder',
    'tibiagoals_wrapper.sh': '🎯 TibiaGoals Reminder',
    'minimax_usage.py': '📊 Minimax Usage Report',
    'minimax_wrapper.sh': '📊 Minimax Usage Report',
    'double_exp_reminder.sh': '⚡ Double Exp Reminder',
    'double_exp_wrapper.sh': '⚡ Double Exp Reminder',
    'security_audit.sh': '🔒 Security Audit',
    'security_audit_wrapper.sh': '🔒 Security Audit',
    'Team hunt': '🏃 Team Hunt Reminder',
    'team_hunt_wrapper.sh': '🏃 Team Hunt Reminder',
    'gog auth': '🔐 gog Auth Reminder',
    'sync_agents_pcloud.sh': '🔄 Sync Agents to pCloud',
    'sync_agents_wrapper.sh': '🔄 Sync Agents to pCloud',
    'morning_prep.sh': '☀️ Morning Prep',
    'check_briefing.sh': '📋 Check Briefing',
    'daily_review_wrapper.sh': '📝 Daily Review',
    'weekly_review_wrapper.sh': '📅 Weekly Review',
    'olympics_canada_monitor.py': '🏅 Olympics Monitor',
    'olympics_monitor_wrapper.sh': '🏅 Olympics Monitor',
    'go_transit_morning.sh': '🚆 GO Transit Morning',
    'cron_monitor.sh': '📈 Cron Monitor',
    'cron': '📈 Cron Monitor'
  };
  
  for (const [key, name] of Object.entries(nameMap)) {
    if (cmd.includes(key)) return name;
  }
  
  // Clean up generic names
  let clean = cmd.replace(/^\/home\/steve\/.openclaw\/workspace\/scripts\//, '')
                 .replace(/^\/home\/steve\/.npm-global\/bin\//, '')
                 .replace(/\.sh$/, '')
                 .replace(/\.py$/, '')
                 .replace(/_wrapper/, '')
                 .replace(/_/g, ' ')
                 .replace(/\s>>.*$/, '')
                 .replace(/\s2>&1$/, '');
  
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function getAllJobs() {
  let jobs = getSystemCrontabJobs();
  const runsMap = getJobRunsFromSyslog();
  
  for (const job of jobs) {
    const cmdShort = job.command
      .replace(/^\/home\/steve\/.openclaw\/workspace\/scripts\//, '')
      .replace(/^\/home\/steve\/.npm-global\/bin\//, '')
      .replace(/\s>>.*$/, '')
      .replace(/\s2>&1$/, '');
    
    const runs = runsMap.get(cmdShort) || [];
    if (runs.length > 0) {
      runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      job.lastRun = runs[0].timestamp;
      job.runCount = runs.length;
      job.lastStatus = checkJobStatus(cmdShort, job.lastRun, job.runCount, job.schedule);
      job.status = job.lastStatus;
      job.runs = runs.slice(0, 20).map(r => ({
        timestamp: r.timestamp,
        status: checkJobStatus(cmdShort, r.timestamp, job.runCount, job.schedule),
        summary: job.name,
        command: r.command
      }));
    } else {
      job.lastStatus = checkJobStatus(cmdShort, null, 0, job.schedule);
      job.status = job.lastStatus;
      job.runs = [];
    }
  }
  
  // Add OpenClaw jobs
  try {
    const { getOpenClawJobs } = require('./openclaw');
    const openclawJobs = getOpenClawJobs();
    jobs = [...jobs, ...openclawJobs];
  } catch (e) {
    console.error('Error loading OpenClaw jobs:', e.message);
  }
  
  const enabled = jobs.filter(j => j.enabled).length;
  const disabled = jobs.filter(j => !j.enabled).length;
  
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

function getJobLogs(jobId, type) {
  const runsMap = getJobRunsFromSyslog();
  
  for (const [cmdShort, runs] of runsMap.entries()) {
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

module.exports = {
  getAllJobs,
  getJobLogs,
  getSystemCrontabJobs,
  getJobRunsFromSyslog,
  checkJobStatus
};

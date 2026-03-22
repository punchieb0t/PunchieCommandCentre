const { execSync } = require('child_process');

const TORONTO_TZ = 'America/Toronto';

// Convert cron expression to human readable
function cronToHuman(expr) {
  if (!expr) return expr;
  
  // Handle */X patterns
  if (expr.includes('*/')) {
    const parts = expr.trim().split(/\s+/);
    const [min, hour, dom, month, dow] = parts;
    if (min.startsWith('*/')) {
      const interval = parseInt(min.slice(2));
      if (interval < 60) {
        return `Every ${interval} min`;
      }
    }
    if (hour && hour.startsWith('*/')) {
      const interval = parseInt(hour.slice(2));
      return `Every ${interval}h`;
    }
  }
  
  // Handle every hour on the hour: 0 * * * *
  if (expr.match(/^0\s+\*\s+\*\s+\*\s+\*$/)) {
    return 'Every hour';
  }
  
  // Handle specific times - convert UTC to Toronto
  const parts = expr.trim().split(/\s+/);
  if (parts.length >= 5) {
    let [min, hour, , , dow] = parts;
    const isUTC = expr.includes('@ UTC');
    
    // Convert UTC to Toronto (EDT = UTC-4)
    let hourNum = parseInt(hour);
    if (isUTC && !isNaN(hourNum)) {
      hourNum = hourNum - 4;
      if (hourNum < 0) hourNum += 24;
    }
    
    // Format time
    const period = hourNum >= 12 ? 'PM' : 'AM';
    const hour12 = hourNum === 0 ? 12 : (hourNum > 12 ? hourNum - 12 : hourNum);
    const timeStr = `${hour12}:${min.padStart(2, '0')} ${period}`;
    
    // Format days
    let daysStr = '';
    if (dow === '*') {
      daysStr = 'Daily';
    } else if (dow === '1-5') {
      daysStr = 'Mon-Fri';
    } else if (dow === '0,6' || dow === '6,0') {
      daysStr = 'Weekends';
    } else if (dow.includes(',')) {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = dow.split(',').map(d => names[parseInt(d)] || d);
      daysStr = days.join(', ');
    } else {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      daysStr = names[parseInt(dow)] || dow;
    }
    
    return `${timeStr} · ${daysStr}`;
  }
  
  return expr;
}

// Get OpenClaw cron jobs with proper timezone conversion
function getOpenClawJobs() {
  try {
    const output = execSync('openclaw cron list --json 2>/dev/null', { encoding: 'utf8', timeout: 10000 });
    const data = JSON.parse(output);
    const jobs = data.jobs || [];
    
    // Name mapping for jobs without proper names
    const nameFixups = {
      'Run: python3 ~/.openclaw/workspace/star-office-ui/update_star_office.py': '⭐ Star Office Updater',
      'Multi-chain Wallet Monitor': '💰 Multi-chain Wallet Monitor',
      'Run: python3': '🔧 Python Script'
    };
    
    return jobs.map(job => {
      const schedule = job.schedule || {};
      const kind = schedule.kind || 'unknown';
      let scheduleStr = '';
      let nextRun = 'N/A';
      let status = job.state?.lastRunStatus || 'unknown';
      
      if (kind === 'cron') {
        const expr = schedule.expr || '';
        scheduleStr = cronToHuman(expr);
        
        // Calculate next run in Toronto time
        try {
          const utcHour = parseInt(schedule.expr?.split(/\s+/)[1] || 0);
          const utcMin = parseInt(schedule.expr?.split(/\s+/)[0] || 0);
          const now = new Date();
          const nextDate = new Date(now);
          nextDate.setUTCHours(utcHour, utcMin, 0, 0);
          if (nextDate <= now) {
            // Find next occurrence
            if (schedule.expr?.includes('*/')) {
              // For every X minutes/hours, just add the interval
              const intervalMin = parseInt(schedule.expr.match(/\*\/(\d+)/)?.[1] || 60);
              nextDate.setTime(nextDate.getTime() + intervalMin * 60 * 1000);
            } else {
              nextDate.setDate(nextDate.getDate() + 1);
            }
          }
          nextRun = nextDate.toLocaleString('en-US', {
            timeZone: TORONTO_TZ,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        } catch (e) {}
        
      } else if (kind === 'every') {
        const ms = schedule.everyMs || 0;
        if (ms >= 3600000) {
          scheduleStr = `Every ${Math.round(ms/3600000)}h`;
        } else {
          scheduleStr = `Every ${Math.round(ms/60000)}m`;
        }
        // Calculate next run
        try {
          const now = new Date();
          nextRun = new Date(now.getTime() + ms).toLocaleString('en-US', {
            timeZone: TORONTO_TZ,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        } catch (e) {}
        
      } else if (kind === 'at') {
        try {
          const dt = new Date(schedule.at);
          nextRun = dt.toLocaleString('en-US', {
            timeZone: TORONTO_TZ,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          scheduleStr = nextRun;
        } catch (e) {
          scheduleStr = schedule.at || 'one-shot';
        }
      }
      
      // Fix up names
      let name = job.name || 'Unnamed Job';
      for (const [bad, good] of Object.entries(nameFixups)) {
        if (name.includes(bad) || (job.payload?.message || '').includes('update_star_office')) {
          name = good;
          break;
        }
      }
      if (name.startsWith('Run: python3')) {
        name = '🔧 Python Script';
      }
      
      return {
        id: job.id || 'unknown',
        name,
        type: 'openclaw',
        status: status === 'ok' ? 'done' : status,
        enabled: job.enabled !== false,
        schedule: scheduleStr,
        command: (job.payload?.message || '').slice(0, 80),
        nextRun,
        lastRun: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toLocaleString('en-US', {
          timeZone: TORONTO_TZ,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }) : null,
        lastStatus: status,
        runCount: 0,
        runs: []
      };
    });
  } catch (e) {
    console.error('OpenClaw cron fetch error:', e.message);
    return [];
  }
}

module.exports = { getOpenClawJobs };

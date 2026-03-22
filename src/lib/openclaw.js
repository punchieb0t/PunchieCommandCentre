const { execSync } = require('child_process');

const TORONTO_TZ = 'America/Toronto';

// Get OpenClaw cron jobs with proper timezone conversion
function getOpenClawJobs() {
  try {
    const output = execSync('openclaw cron list --json 2>/dev/null', { encoding: 'utf8', timeout: 10000 });
    const data = JSON.parse(output);
    const jobs = data.jobs || [];
    
    return jobs.map(job => {
      const schedule = job.schedule || {};
      const kind = schedule.kind || 'unknown';
      let scheduleStr = '';
      let nextRun = 'N/A';
      let status = job.state?.lastRunStatus || 'unknown';
      
      if (kind === 'cron') {
        const expr = schedule.expr || '';
        const isUTC = expr.includes('@ UTC') || schedule.tz === 'UTC';
        scheduleStr = expr.replace(' @ UTC', '').trim();
        
        // Convert UTC hour to Toronto time
        if (isUTC) {
          const parts = scheduleStr.split(/\s+/);
          if (parts.length >= 2) {
            let hour = parseInt(parts[1]);
            const min = parseInt(parts[0]);
            // EDT is UTC-4, so subtract 4 from UTC hour
            hour = hour - 4;
            if (hour < 0) hour += 24;
            if (hour >= 24) hour -= 24;
            parts[1] = hour.toString();
            scheduleStr = parts.join(' ');
          }
        }
        
        // Calculate next run in Toronto time
        try {
          const utcHour = parseInt(schedule.expr?.split(/\s+/)[1] || 0);
          const localHour = utcHour - 4; // EDT offset
          const adjustedHour = localHour < 0 ? localHour + 24 : (localHour >= 24 ? localHour - 24 : localHour);
          const now = new Date();
          const nextDate = new Date(now);
          nextDate.setUTCHours(utcHour, parseInt(schedule.expr?.split(/\s+/)[0]) || 0, 0, 0);
          if (nextDate <= now) nextDate.setDate(nextDate.getDate() + 1);
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
          scheduleStr = `every ${Math.round(ms/3600000)}h`;
        } else {
          scheduleStr = `every ${Math.round(ms/60000)}m`;
        }
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
      
      return {
        id: job.id || 'unknown',
        name: job.name || 'Unnamed Job',
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

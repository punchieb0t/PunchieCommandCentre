'use client';

import { useState, useEffect } from 'react';

interface Job {
  id: string;
  name: string;
  status: string;
  schedule: string;
  command: string;
  nextRun: string;
  lastRun: string | null;
  runCount?: number;
}

interface JobsData {
  system: Job[];
  summary: {
    total: number;
    enabled: number;
    disabled: number;
    totalRuns: number;
    nextScheduledRun: string;
  };
}

interface StatusData {
  system: {
    cpu: number;
    memory: { total: number; used: number; free: number; percent: number };
    disk: { total: number; used: number; free: number };
    uptime: string;
    hostname: string;
  };
  crypto: { symbol: string; price: number; change24h: number }[];
  weather: { temp_C: string; weatherDesc: string; humidity: string; wind_kmph: string; location: string };
  backups: { lastBackup: string; lastBackupSize: string; lastVerify: string; pCloudConnected: boolean };
  services: { name: string; status: string; ip: string; port: number | null }[];
  timestamp: string;
}

// Parse cron schedule into day/time (12h format)
function parseCronSchedule(schedule: string): { days: string[]; time: string } {
  const parts = schedule.split(' ');
  if (parts.length < 5) return { days: [], time: '' };
  
  const [min, hour] = parts;
  const dayOfWeek = parts[4];
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let days: string[] = [];
  
  if (dayOfWeek === '*') {
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  } else if (dayOfWeek.includes(',')) {
    days = dayOfWeek.split(',').map(d => dayNames[parseInt(d)]);
  } else if (dayOfWeek.includes('-')) {
    const [start, end] = dayOfWeek.split('-').map(Number);
    for (let i = start; i <= end; i++) days.push(dayNames[i]);
  } else {
    days = [dayNames[parseInt(dayOfWeek)] || dayOfWeek];
  }
  
  // Convert to 12-hour format
  const hourNum = parseInt(hour);
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  const hour12 = hourNum % 12 || 12;
  const time = `${hour12}:${min.padStart(2, '0')} ${ampm}`;
  
  return { days, time };
}

// Convert cron to plain English
function cronToEnglish(schedule: string): string {
  const parts = schedule.split(' ');
  if (parts.length < 5) return 'Unknown schedule';
  
  const [min, hour, dayOfMonth, month] = parts;
  const dow = parts[4];
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Format time
  const hourNum = parseInt(hour);
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  const hour12 = hourNum % 12 || 12;
  const minStr = min === '0' ? '' : min === '*' ? '' : `:${min}`;
  const timeStr = `at ${hour12}${minStr} ${ampm}`;
  
  // Daily (e.g., "0 3 * * *")
  if (dow === '*' && dayOfMonth === '*' && month === '*') {
    return `Runs daily ${timeStr}`;
  }
  
  // Specific days (e.g., "30 20 * * 0,3")
  if (dow !== '*') {
    const days: string[] = [];
    if (dow.includes(',')) {
      dow.split(',').forEach(d => days.push(dayNames[parseInt(d)]));
    } else if (dow.includes('-')) {
      const [start, end] = dow.split('-').map(Number);
      for (let i = start; i <= end; i++) days.push(dayNames[i]);
    } else {
      days.push(dayNames[parseInt(dow)]);
    }
    return `Runs every ${days.join(', ')} ${timeStr}`;
  }
  
  // Monthly (e.g., "0 0 1 * *")
  if (dayOfMonth !== '*' && month === '*') {
    return `Runs on the ${getOrdinal(parseInt(dayOfMonth))} of every month ${timeStr}`;
  }
  
  // Specific month (e.g., "0 21 5 3 *")
  if (month !== '*') {
    const monthName = monthNames[parseInt(month)];
    if (dayOfMonth !== '*') {
      return `Runs on ${monthName} ${getOrdinal(parseInt(dayOfMonth))} ${timeStr}`;
    }
    return `Runs every ${monthName} ${timeStr}`;
  }
  
  return `Runs ${timeStr}`;
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getJobSchedule(schedule: string): { days: string[]; time: string } {
  return parseCronSchedule(schedule);
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<JobsData | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const toggleDay = (day: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const fetchData = async () => {
    try {
      setError(null);
      const [jobsRes, statusRes, cryptoRes] = await Promise.all([
        fetch('/api/jobs'),
        fetch('/api/status'),
        fetch('/api/crypto?_=' + Date.now())
      ]);
      
      const jobsData = await jobsRes.json();
      const statusData = await statusRes.json();
      const cryptoData = await cryptoRes.json();
      
      setJobs(jobsData);
      setStatus({ ...statusData, crypto: cryptoData.crypto });
      setLastUpdated(new Date().toLocaleTimeString());
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Fetch crypto separately every 5 minutes (bypass cache)
    const cryptoInterval = setInterval(async () => {
      try {
        const cryptoRes = await fetch('/api/crypto?_=' + Date.now());
        const cryptoData = await cryptoRes.json();
        setStatus(prev => prev ? { ...prev, crypto: cryptoData.crypto } : null);
      } catch (e) {}
    }, 5 * 60 * 1000);
    
    // Refresh everything every 30 seconds
    const statusInterval = setInterval(fetchData, 30000);
    return () => {
      clearInterval(cryptoInterval);
      clearInterval(statusInterval);
    };
  }, []);

  // Build calendar data
  const calendarData = jobs?.system ? (() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const schedule: Record<string, { job: Job; time: string }[]> = {
      Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: []
    };
    
    for (const job of jobs.system) {
      const { days: jobDays, time } = getJobSchedule(job.schedule);
      for (const day of jobDays) {
        if (schedule[day]) {
          schedule[day].push({ job, time });
        }
      }
    }
    
    // Sort each day by time
    for (const day of days) {
      schedule[day].sort((a, b) => a.time.localeCompare(b.time));
    }
    
    return { days, schedule };
  })() : null;

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>🎯 Punchie Command Centre</h1>
        <div className="header-actions">
          <button className={`btn ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView(view === 'list' ? 'calendar' : 'list')}>
            {view === 'calendar' ? '📋 List' : '📅 Calendar'}
          </button>
          <button className="btn" onClick={fetchData}>🔄 Refresh</button>
          <span className="last-updated">Last updated: {lastUpdated}</span>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {/* Status Cards */}
      <div className="status-cards">
        <div className="status-card">
          <h3>CPU</h3>
          <div className="value">{status?.system?.cpu || 0}%</div>
        </div>
        <div className="status-card">
          <h3>Memory</h3>
          <div className="value">{status?.system?.memory?.percent || 0}%</div>
          <div className="sub">{status?.system?.memory?.used || 0}GB / {status?.system?.memory?.total || 0}GB</div>
        </div>
        <div className="status-card">
          <h3>Disk</h3>
          <div className="value">{status?.system?.disk?.used || 0}GB</div>
          <div className="sub">{status?.system?.disk?.free || 0}GB free</div>
        </div>
        <div className="status-card">
          <h3>Uptime</h3>
          <div className="value">{status?.system?.uptime || 'N/A'}</div>
        </div>
        <div className="status-card">
          <h3>Weather</h3>
          <div className="value">{status?.weather?.temp_C || '?'}°C</div>
          <div className="sub">{status?.weather?.weatherDesc || 'Loading...'}</div>
        </div>
        <div className="status-card">
          <h3>Backup</h3>
          <div className="value">{status?.backups?.pCloudConnected ? '✅' : '❌'}</div>
          <div className="sub">{status?.backups?.lastBackup || 'No backup'}</div>
        </div>
      </div>

      {/* Services */}
      <div className="jobs-section">
        <h2>📡 Services</h2>
        <div className="services-list">
          {status?.services?.map((service) => (
            <div key={service.name} className="service-item">
              <span>{service.name} ({service.ip}{service.port ? `:${service.port}` : ''})</span>
              <span className={`status ${service.status}`}>{service.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Crypto */}
      <div className="jobs-section">
        <h2>💰 Crypto</h2>
        <div className="crypto-grid">
          {status?.crypto?.map((coin) => (
            <div key={coin.symbol} className="crypto-card">
              <div className="symbol">{coin.symbol}</div>
              <div className="price">${coin.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className={`change ${coin.change24h >= 0 ? 'positive' : 'negative'}`}>
                {coin.change24h >= 0 ? '↑' : '↓'} {Math.abs(coin.change24h).toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar View */}
      {view === 'calendar' && calendarData && (
        <div className="jobs-section">
          <h2>📅 Weekly Schedule</h2>
          <div className="legend">
            <span className="legend-item"><span className="status-dot done"></span>Ran today</span>
            <span className="legend-item"><span className="status-dot scheduled"></span>Waiting</span>
            <span className="legend-item"><span className="status-dot idle"></span>Not today</span>
            <span className="legend-item"><span className="status-dot never"></span>Never run</span>
            <span className="legend-item"><span className="status-dot failed"></span>Failed</span>
          </div>
          <div className="calendar-grid">
            {calendarData.days.map(day => (
              <div key={day} className={`calendar-day ${collapsedDays.has(day) ? 'collapsed' : ''}`}>
                <div className="day-header" onClick={() => toggleDay(day)}>
                  <span>{day}</span>
                  <span className="collapse-icon">{collapsedDays.has(day) ? '▶' : '▼'}</span>
                </div>
                {!collapsedDays.has(day) && (
                  <div className="day-jobs">
                    {calendarData.schedule[day].length === 0 ? (
                      <div className="no-jobs">—</div>
                    ) : (
                      calendarData.schedule[day].map(({ job, time }, idx) => (
                        <div key={`${job.id}-${idx}`} className="calendar-job clickable" onClick={() => setSelectedJob(job)}>
                          <span className="job-time">{time}</span>
                          <span className={`status-dot ${job.status}`}></span>
                          <span className="job-name">{job.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="jobs-section">
          <h2>⏰ All Cron Jobs</h2>
          <div className="jobs-summary">
            <span>Total: <strong>{jobs?.summary?.total || 0}</strong></span>
            <span>Enabled: <strong>{jobs?.summary?.enabled || 0}</strong></span>
            <span>Total Runs: <strong>{jobs?.summary?.totalRuns || 0}</strong></span>
            <span>Next: <strong>{jobs?.summary?.nextScheduledRun || 'N/A'}</strong></span>
          </div>
          <div className="jobs-grid">
            {jobs?.system?.map((job) => (
              <div key={job.id} className="job-card clickable" onClick={() => setSelectedJob(job)}>
                <div className="job-name">
                  <span className={`status-dot ${job.status}`}></span>
                  {job.name}
                </div>
                <div className="job-command" title={job.command}>{job.command}</div>
                <div className="job-schedule">{job.schedule}</div>
                <div className="job-next">{job.nextRun}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedJob.name}</h2>
              <button className="modal-close" onClick={() => setSelectedJob(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label">Schedule</span>
                <span className="detail-value">{selectedJob.schedule}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Runs</span>
                <span className="detail-value highlight">{cronToEnglish(selectedJob.schedule)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className={`detail-value status-${selectedJob.status}`}>{selectedJob.status}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Last Run</span>
                <span className="detail-value">{selectedJob.lastRun || 'Never'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Run Count</span>
                <span className="detail-value">{selectedJob.runCount || 0} times</span>
              </div>
              <div className="detail-row full">
                <span className="detail-label">Command</span>
                <code className="detail-command">{selectedJob.command}</code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

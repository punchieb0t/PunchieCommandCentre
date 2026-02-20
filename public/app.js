// ===== State =====
const state = {
  system: null,
  jobs: { system: [], openclaw: [] },
  services: [],
  backup: null,
  remoteSystems: {},
  currentWeekStart: getWeekStart(new Date()),
  currentFilter: 'all',
  loading: false
};

// ===== Utilities =====
function getJobDisplayName(job) {
  const nameMap = {
    "backup_wrapper.sh": "📦 Daily Backup to pCloud",
    "verify_wrapper.sh": "✅ Verify Backup",
    "send_morning_briefing.sh": "📰 Morning Briefing",
    "check_briefing.sh": "🔍 Check Briefing Sent",
    "morning_prep.sh": "🌅 Morning Prep",
    "tibiadrome_wrapper.sh": "⚔️ TibiaDrome Reminder",
    "tibiagoals_wrapper.sh": "🎯 TibiaGoals Reminder",
    "team_hunt_wrapper.sh": "🗡️ Team Hunt Reminder",
    "minimax_wrapper.sh": "📊 Minimax Usage Check",
    "security_audit_wrapper.sh": "🔒 Security Audit",
    "double_exp_wrapper.sh": "🎮 Double Exp Reminder",
    "cron_monitor": "⏰ Cron Alive Monitor",
    "sync_agents_pcloud.sh": "☁️ Sync Agents to pCloud",
    "daily_review_wrapper.sh": "📝 Daily Review",
    "weekly_review_wrapper.sh": "📅 Weekly Review",
    "olympics_canada_monitor.py": "🏅 Olympics Monitor",
    "go_transit_morning.sh": "🚂 GO Transit Morning",
  };
  
  // Check both name and command fields
  const searchText = (job.name || '') + ' ' + (job.command || '');
  
  for (const [key, value] of Object.entries(nameMap)) {
    if (searchText.includes(key)) { return value; }
  }
  
  const parts = cronLine.split("/");
  const scriptName = parts[parts.length - 1].replace("_wrapper.sh", "").replace(".sh", "").replace(".py", "");
  return scriptName.replace(_/g, " ").replace(/\\b\\w/g, l => l.toUpperCase());
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function parseCronToNextRun(cronExpr) {
  // Simple cron parser - returns next few run times
  if (!cronExpr) return [];
  
  const parts = cronExpr.split(' ');
  if (parts.length < 5) return [];
  
  const [min, hour, day, month, weekday] = parts;
  const runs = [];
  const now = new Date();
  
  for (let i = 0; i < 14; i++) {
    const checkDate = addDays(now, i);
    const dayOfWeek = checkDate.getDay();
    const dayOfMonth = checkDate.getDate();
    const month = checkDate.getMonth() + 1;
    
    // Simplified cron check
    let matches = true;
    if (day !== '*' && day !== '0' && parseInt(day) !== dayOfMonth) matches = false;
    if (weekday !== '*' && parseInt(weekday) !== dayOfWeek && weekday !== dayOfWeek.toString()) matches = false;
    
    if (matches) {
      const h = hour === '*' ? 0 : parseInt(hour) || 0;
      const m = min === '*' ? 0 : parseInt(min) || 0;
      const runDate = new Date(checkDate);
      runDate.setHours(h, m, 0, 0);
      
      if (runDate > now) {
        runs.push(runDate);
      }
    }
  }
  
  return runs.slice(0, 5);
}

// ===== API Calls =====
async function fetchAllData() {
  setLoading(true);
  
  try {
    const [systemRes, jobsRes, servicesRes, backupsRes] = await Promise.all([
      fetch('/api/status/system'),
      fetch('/api/jobs'),
      fetch('/api/status/services'),
      fetch('/api/status/backups')
    ]);
    
    state.system = await systemRes.json();
    state.jobs = await jobsRes.json();
    state.services = await servicesRes.json();
    state.backup = await backupsRes.json();
    
    // Check remote systems
    await checkRemoteSystems();
    
    updateUI();
  } catch (err) {
    console.error('Error fetching data:', err);
  } finally {
    setLoading(false);
  }
}

async function checkRemoteSystems() {
  // Check Portainer on Umbrel (10.0.0.147:9000)
  try {
    const portainerRes = await fetch('http://10.0.0.147:9000/api/system/status', { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    state.remoteSystems.portainer = portainerRes.ok ? 'running' : 'stopped';
  } catch (e) {
    state.remoteSystems.portainer = 'stopped';
  }
  
  // Check GOTransitJS (local port 3001)
  try {
    const gotransitRes = await fetch('http://localhost:3001/api/health', { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    state.remoteSystems.gotransit = gotransitRes.ok ? 'running' : 'stopped';
  } catch (e) {
    state.remoteSystems.gotransit = 'stopped';
  }
}

async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  
  await fetchAllData();
  
  btn.classList.remove('spinning');
  document.getElementById('lastUpdated').textContent = `Updated ${formatTime(new Date())}`;
}

// ===== UI Updates =====
function updateUI() {
  updateStatusCards();
  updateCalendar();
  updateJobsList();
  updateSystemView();
}

function updateStatusCards() {
  const { system, backup, jobs } = state;
  
  // CPU
  if (system?.cpu !== undefined) {
    document.getElementById('cpuValue').textContent = `${Math.round(system.cpu)}%`;
    document.getElementById('cpuBar').style.width = `${system.cpu}%`;
  }
  
  // Memory
  if (system?.memory) {
    const mem = system.memory;
    document.getElementById('memValue').textContent = `${mem.percent}%`;
    document.getElementById('memBar').style.width = `${mem.percent}%`;
  }
  
  // Backup
  if (backup) {
    const lastBackup = backup.lastBackup || backup.last || null;
    if (lastBackup) {
      const backupDate = new Date(lastBackup);
      const now = new Date();
      const hoursAgo = Math.round((now - backupDate) / (1000 * 60 * 60));
      
      if (hoursAgo < 24) {
        document.getElementById('backupValue').textContent = `${hoursAgo}h ago`;
      } else {
        document.getElementById('backupValue').textContent = `${Math.floor(hoursAgo / 24)}d ago`;
      }
      document.getElementById('backupTime').textContent = backupDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
      document.getElementById('backupValue').textContent = 'Never';
    }
  }
  
  // Cron Jobs
  const totalJobs = (jobs.system?.length || 0) + (jobs.openclaw?.length || 0);
  document.getElementById('cronValue').textContent = `${totalJobs} jobs`;
  document.getElementById('cronStatus').textContent = totalJobs > 0 ? 'Active' : 'None';
}

function updateCalendar() {
  const weekGrid = document.getElementById('weekGrid');
  const weekRange = document.getElementById('weekRange');
  const timeline = document.getElementById('timeline');
  
  // Update week range text
  const weekEnd = addDays(state.currentWeekStart, 6);
  weekRange.textContent = `${formatDate(state.currentWeekStart)} - ${formatDate(weekEnd)}`;
  
  // Build week grid
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let weekHTML = '';
  const jobsThisWeek = [...(state.jobs.system || []), ...(state.jobs.openclaw || [])];
  
  for (let i = 0; i < 7; i++) {
    const day = addDays(state.currentWeekStart, i);
    const dayStr = day.toISOString().split('T')[0];
    const isToday = day.getTime() === today.getTime();
    
    // Count jobs scheduled for this day
    let jobCount = 0;
    jobsThisWeek.forEach(job => {
      const nextRuns = parseCronToNextRun(job.schedule);
      nextRuns.forEach(run => {
        if (run.toISOString().split('T')[0] === dayStr) {
          jobCount++;
        }
      });
    });
    
    weekHTML += `
      <div class="day-card ${isToday ? 'today' : ''} ${jobCount > 0 ? 'has-jobs' : ''}">
        <div class="day-name">${day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div class="day-number">${day.getDate()}</div>
        ${jobCount > 0 ? `<div class="day-jobs-count">${jobCount} job${jobCount > 1 ? 's' : ''}</div>` : ''}
      </div>
    `;
  }
  weekGrid.innerHTML = weekHTML;
  
  // Build timeline
  let timelineHTML = '';
  const timelineDays = {};
  
  jobsThisWeek.forEach(job => {
    const nextRuns = parseCronToNextRun(job.schedule);
    nextRuns.forEach(run => {
      const dayStr = run.toISOString().split('T')[0];
      if (!timelineDays[dayStr]) {
        timelineDays[dayStr] = [];
      }
      timelineDays[dayStr].push({
        time: run,
        job: job
      });
    });
  });
  
  // Sort days chronologically and render
  Object.keys(timelineDays).sort((a, b) => new Date(a) - new Date(b)).forEach(dayStr => {
    const dayDate = new Date(dayStr);
    const events = timelineDays[dayStr].sort((a, b) => a.time - b.time);
    
    timelineHTML += `
      <div class="timeline-day">
        <div class="timeline-day-header">
          ${dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <div class="timeline-events">
          ${events.map(e => `
            <div class="timeline-event">
              <span class="event-time">${formatTime(e.time)}</span>
              <div class="event-info">
                <div class="event-name">${getJobDisplayName(e.job)}</div>
                <div class="event-schedule">${e.job.schedule}</div>
              </div>
              <div class="event-status ${e.job.status || 'pending'}"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });
  
  if (Object.keys(timelineDays).length === 0) {
    timelineHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>No scheduled jobs this week</p>
      </div>
    `;
  }
  
  timeline.innerHTML = timelineHTML;
}

function updateJobsList() {
  const jobsList = document.getElementById('jobsList');
  let jobs = [];
  
  if (state.currentFilter === 'all') {
    jobs = [...(state.jobs.system || []), ...(state.jobs.openclaw || [])];
  } else if (state.currentFilter === 'system') {
    jobs = state.jobs.system || [];
  } else if (state.currentFilter === 'openclaw') {
    jobs = state.jobs.openclaw || [];
  }
  
  if (jobs.length === 0) {
    jobsList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        <p>No jobs found</p>
      </div>
    `;
    return;
  }
  
  jobsList.innerHTML = jobs.map(job => `
    <div class="job-card" data-type="${job.type}">
      <div class="job-header">
        <div class="job-name">${getJobDisplayName(job)}</div>
        <span class="job-type ${job.type}">${job.type}</span>
      </div>
      <div class="job-meta">
        <span class="job-schedule">${job.schedule}</span>
        <span class="job-lastrun">Last: ${job.lastRun || 'Never'}</span>
      </div>
    </div>
  `).join('');
}

function updateSystemView() {
  const { system, services, remoteSystems } = state;
  
  if (system) {
    document.getElementById('hostname').textContent = system.hostname || '--';
    document.getElementById('uptime').textContent = system.uptime || '--';
    document.getElementById('loadAvg').textContent = system.loadAvg || '--';
    document.getElementById('diskUsage').textContent = system.disk || '--';
  }
  
  const servicesList = document.getElementById('servicesList');
  if (Array.isArray(services) && services.length > 0) {
    servicesList.innerHTML = services.map(svc => `
      <div class="service-item">
        <span class="service-name">${svc.name || svc.service}</span>
        <span class="service-status ${svc.status === 'running' ? 'running' : 'stopped'}">
          ${svc.status || 'unknown'}
        </span>
      </div>
    `).join('');
  } else {
    servicesList.innerHTML = `
      <div class="empty-state">
        <p>No services data</p>
      </div>
    `;
  }
  
  // Remote Systems
  const remoteList = document.getElementById('remoteSystemsList');
  const systems = [
    { name: 'Portainer (Umbrel)', status: remoteSystems.portainer || 'unknown' },
    { name: 'GOTransitJS', status: remoteSystems.gotransit || 'unknown' }
  ];
  
  remoteList.innerHTML = systems.map(sys => `
    <div class="service-item">
      <span class="service-name">${sys.name}</span>
      <span class="service-status ${sys.status === 'running' ? 'running' : 'stopped'}">
        ${sys.status || 'unknown'}
      </span>
    </div>
  `).join('');
}

// ===== Loading =====
function setLoading(loading) {
  state.loading = loading;
  const overlay = document.getElementById('loadingOverlay');
  if (loading) {
    overlay.classList.add('visible');
  } else {
    overlay.classList.remove('visible');
  }
}

// ===== Event Listeners =====
function initEventListeners() {
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', refreshData);
  
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}View`).classList.add('active');
    });
  });
  
  // Job filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.dataset.filter;
      updateJobsList();
    });
  });
  
  // Calendar navigation
  document.getElementById('prevWeek').addEventListener('click', () => {
    state.currentWeekStart = addDays(state.currentWeekStart, -7);
    updateCalendar();
  });
  
  document.getElementById('nextWeek').addEventListener('click', () => {
    state.currentWeekStart = addDays(state.currentWeekStart, 7);
    updateCalendar();
  });
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  fetchAllData();
  
  // Auto-refresh every 60 seconds
  setInterval(fetchAllData, 60000);
});

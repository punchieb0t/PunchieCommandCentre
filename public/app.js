// ===== State =====
const state = {
  system: null,
  jobs: { system: [], openclaw: [] },
  services: [],
  backup: null,
  remoteSystems: {},
  containers: { containers: [] },
  currentWeekStart: new Date(new Date().setHours(0,0,0,0)), // Start from today
  currentFilter: 'all',
  selectedDay: null, // For filtering timeline by day
  historicalRuns: [], // For storing actual runs from syslog
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


// Icon SVG mapping - returns SVG string for icon name
function getJobIcon(job) {
  const icons = {
    "backup_wrapper.sh": "hard-drive",
    "verify_wrapper.sh": "check-circle",
    "send_morning_briefing.sh": "newspaper",
    "check_briefing.sh": "search",
    "morning_prep.sh": "sunrise",
    "tibiadrome_wrapper.sh": "swords",
    "tibiagoals_wrapper.sh": "target",
    "team_hunt_wrapper.sh": "crosshair",
    "minimax_wrapper.sh": "bar-chart-2",
    "security_audit_wrapper.sh": "shield",
    "double_exp_wrapper.sh": "zap",
    "cron_monitor": "clock",
    "sync_agents_pcloud.sh": "cloud",
    "daily_review_wrapper.sh": "file-text",
    "weekly_review_wrapper.sh": "calendar",
    "olympics_canada_monitor.py": "trophy",
    "go_transit_morning.sh": "train",
  };
  const searchText = (job.name || '') + ' ' + (job.command || '');
  for (const [key, icon] of Object.entries(icons)) {
    if (searchText.includes(key)) return icon;
  }
  return 'terminal';
}

function renderIcon(iconName) {
  const svgs = {
    'hard-drive': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>',
    'cpu': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
    'memory': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg>',
    'check-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    'newspaper': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2Zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/></svg>',
    'search': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    'sunrise': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18a5 5 0 00-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/></svg>',
    'swords': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/></svg>',
    'target': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    'crosshair': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/></svg>',
    'bar-chart-2': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    'shield': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'zap': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    'clock': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    'cloud': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>',
    'file-text': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    'calendar': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>',
    'trophy': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/></svg>',
    'train': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3"/></svg>',
    'terminal': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    'settings': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  };
  return svgs[iconName] || svgs['terminal'];
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

// 12-hour format with AM/PM
function formatTime12Hour(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Convert cron to plain English
function cronToEnglish(cron) {
  const parts = cron.split(' ');
  if (parts.length < 5) return cron;
  
  const [min, hour, , , dow] = parts;
  
  // Daily at specific time
  if (min !== '*' && hour !== '*' && dow === '*') {
    const h = parseInt(hour);
    const m = min === '0' ? '' : `:${min}`;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Daily at ${h12}${m} ${period}`;
  }
  
  // Every X minutes
  if (min.includes('/')) {
    const interval = min.split('/')[1];
    return `Every ${interval} minutes`;
  }
  
  // Specific days
  if (dow !== '*' && !dow.includes(',')) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[parseInt(dow)] || dow;
    if (min !== '*' && hour !== '*') {
      const h = parseInt(hour);
      const m = min === '0' ? '' : `:${min}`;
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `Every ${dayName} at ${h12}${m} ${period}`;
    }
    return `Every ${dayName}`;
  }
  
  return cron;
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

function parseCronToNextRun(cronExpr, weekStart) {
  // Simple cron parser - returns runs for this full week
  if (!cronExpr) return [];
  
  // Handle human-readable format from backend (e.g., "9:45 PM · Daily", "7:25 AM · Mon-Fri")
  if (cronExpr.includes('·')) {
    const parts = cronExpr.split('·').map(p => p.trim());
    const timePart = parts[0];
    const daysPart = parts[1] || '';
    
    // Parse time "9:45 PM" -> hour, minute
    const timeMatch = timePart.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      const period = timeMatch[3].toUpperCase();
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
      
      // Determine which days match
      const runs = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const checkDate = new Date(weekStart);
        checkDate.setDate(weekStart.getDate() + dayOffset);
        const dayOfWeek = checkDate.getDay();
        
        let matches = false;
        if (daysPart === 'Daily') matches = true;
        else if (daysPart === 'Mon-Fri') matches = dayOfWeek >= 1 && dayOfWeek <= 5;
        else if (daysPart === 'Weekends') matches = dayOfWeek === 0 || dayOfWeek === 6;
        else {
          // Parse day names
          const dayNames = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
          for (const [name, num] of Object.entries(dayNames)) {
            if (daysPart.includes(name)) {
              if (dayOfWeek === num) { matches = true; break; }
            }
          }
        }
        
        if (matches) {
          const runDate = new Date(checkDate);
          runDate.setHours(hour, minute, 0, 0);
          runs.push(runDate);
        }
      }
      return runs;
    }
  }
  
  // Use provided weekStart or calculate from today
  const refDate = weekStart || new Date();
  
  // Handle human-readable formats - show runs for entire week
  if (cronExpr.startsWith('Every ')) {
    const runs = [];
    
    if (cronExpr.includes('min')) {
      const mins = parseInt(cronExpr.match(/\d+/)?.[0] || '5');
      // Generate runs for the full week starting from weekStart
      for (let day = 0; day < 7; day++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + day);
        for (let h = 0; h < 24; h++) {
          for (let m = 0; m < 60; m += mins) {
            const run = new Date(dayDate);
            run.setHours(h, m, 0, 0);
            runs.push(run);
          }
        }
      }
    } else if (cronExpr.includes('hour')) {
      for (let day = 0; day < 7; day++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + day);
        for (let h = 0; h < 24; h++) {
          const run = new Date(dayDate);
          run.setHours(h, 0, 0, 0);
          runs.push(run);
        }
      }
    }
    
    return runs;
  }
  
  const parts = cronExpr.split(' ');
  if (parts.length < 5) return [];
  
  const [min, hour, day, month, weekday] = parts;
  const runs = [];
  
  // Generate runs for the full week (7 days starting from weekStart)
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDate = new Date(weekStart);
    checkDate.setDate(weekStart.getDate() + dayOffset);
    const dayOfWeek = checkDate.getDay();
    const dayOfMonth = checkDate.getDate();
    const currentMonth = checkDate.getMonth() + 1;
    
    // Simplified cron check
    let matches = true;
    
    // Check day of month
    if (day !== '*' && day !== '0' && parseInt(day) !== dayOfMonth) matches = false;
    
    // Check weekday - handle ranges like "1-5" (Mon-Fri)
    if (weekday !== '*') {
      let weekdayMatches = false;
      
      // Handle range like "1-5"
      if (weekday.includes('-')) {
        const [start, end] = weekday.split('-').map(d => parseInt(d));
        weekdayMatches = dayOfWeek >= start && dayOfWeek <= end;
      } else {
        // Single day or comma-separated
        const weekdays = weekday.split(',').map(d => parseInt(d));
        weekdayMatches = weekdays.includes(dayOfWeek);
      }
      
      if (!weekdayMatches) matches = false;
    }
    
    if (matches) {
      const h = hour === '*' ? 0 : parseInt(hour) || 0;
      const m = min === '*' ? 0 : parseInt(min) || 0;
      const runDate = new Date(checkDate);
      runDate.setHours(h, m, 0, 0);
      runs.push(runDate);
    }
  }
  
  return runs;
}

// ===== API Calls =====
async function fetchAllData() {
  setLoading(true);
  
  try {
    const [systemRes, jobsRes, servicesRes, backupsRes, containersRes] = await Promise.all([
      fetch('/api/status/system'),
      fetch('/api/jobs'),
      fetch('/api/status/services'),
      fetch('/api/status/backups'),
      fetch('/api/status/containers')
    ]);
    
    state.system = await systemRes.json();
    state.jobs = await jobsRes.json();
    state.services = await servicesRes.json();
    state.backup = await backupsRes.json();
    state.containers = await containersRes.json();
    
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
  // Check Umbrel via backend (avoids CORS)
  try {
    const umbrelRes = await fetch('/api/umbrel', { 
      signal: AbortSignal.timeout(10000)
    });
    const umbrelData = await umbrelRes.json();
    state.remoteSystems.umbrel = umbrelData.umbrelOnline ? 'running' : 'stopped';
  } catch (e) {
    state.remoteSystems.umbrel = 'stopped';
  }
  
  // Check GO Transit via backend proxy
  try {
    const gotransitRes = await fetch('/api/gotransit', { 
      signal: AbortSignal.timeout(10000)
    });
    const gotransitData = await gotransitRes.json();
    state.remoteSystems.gotransit = gotransitData.status || 'stopped';
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

// ===== Day Selection =====
async function selectDay(dayStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = new Date(dayStr);
  selectedDate.setHours(0, 0, 0, 0);
  
  const isPast = selectedDate < today;
  
  // If selecting a past day, fetch historical runs
  if (isPast) {
    try {
      const res = await fetch(`/api/runs/${dayStr}`);
      const data = await res.json();
      state.historicalRuns = data.runs || [];
    } catch (err) {
      console.error('Error fetching historical runs:', err);
      state.historicalRuns = [];
    }
  } else {
    state.historicalRuns = [];
  }
  
  // Toggle: if clicking same day, deselect
  state.selectedDay = state.selectedDay === dayStr ? null : dayStr;
  updateCalendar();
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
    const dayStr = day.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    const isToday = day.getTime() === today.getTime();
    
    // Count unique jobs that have at least one run on this day
    let jobCount = 0;
    jobsThisWeek.forEach(job => {
      const runs = parseCronToNextRun(job.schedule, state.currentWeekStart);
      const hasRunOnDay = runs.some(run => run.toLocaleDateString('en-CA') === dayStr);
      if (hasRunOnDay) jobCount++;
    });
    
    const isSelected = state.selectedDay === dayStr;
    
    weekHTML += `
      <div class="day-card ${isToday ? 'today' : ''} ${jobCount > 0 ? 'has-jobs' : ''} ${isSelected ? 'selected' : ''}" onclick="selectDay('${dayStr}')">
        <div class="day-name">${day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div class="day-number">${day.getDate()}</div>
        ${jobCount > 0 ? `<div class="day-jobs-count">${jobCount} job${jobCount > 1 ? 's' : ''}</div>` : ''}
      </div>
    `;
  }
  weekGrid.innerHTML = weekHTML;
  
  // Build timeline
  let timelineHTML = '';
  
  // Check if viewing a past day - show historical runs instead of scheduled
  if (state.selectedDay && state.historicalRuns.length > 0) {
    const dayDate = new Date(state.selectedDay + 'T00:00:00');
    timelineHTML += `
      <div class="timeline-day">
        <div class="timeline-day-header">
          <span>${dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          <span class="timeline-day-label">Historical Runs</span>
        </div>
        <div class="timeline-events">
    `;
    
    state.historicalRuns.forEach(run => {
      const runTime = new Date(run.timestamp);
      timelineHTML += `
        <div class="timeline-event">
          <div class="timeline-time">${runTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="timeline-content">
            <div class="timeline-job">${run.cmd}</div>
          </div>
        </div>
      `;
    });
    
    timelineHTML += `
        </div>
      </div>
    `;
  } else {
    const timelineDays = {};
    
    jobsThisWeek.forEach(job => {
      // Check if this is an interval job (Every X min/hr)
      const isInterval = job.schedule && job.schedule.startsWith('Every ');
      
      if (isInterval) {
        // For interval jobs, show just ONE entry for today
        const todayStr = today.toLocaleDateString('en-CA');
        if (!timelineDays[todayStr]) {
          timelineDays[todayStr] = [];
        }
        // Only add if not already added for this job
        const alreadyAdded = timelineDays[todayStr].some(e => e.job.name === job.name && e.isInterval);
        if (!alreadyAdded) {
          timelineDays[todayStr].push({
            time: today,
            job: job,
            isInterval: true
          });
        }
      } else {
        // For regular cron jobs, add all scheduled runs
        const nextRuns = parseCronToNextRun(job.schedule, state.currentWeekStart);
        nextRuns.forEach(run => {
          const dayStr = run.toLocaleDateString('en-CA');
          if (!timelineDays[dayStr]) {
            timelineDays[dayStr] = [];
          }
          timelineDays[dayStr].push({
            time: run,
            job: job,
            isInterval: false
          });
        });
      }
    });
    
    const todayStr = today.toLocaleDateString('en-CA');
    
    const dayKeys = Object.keys(timelineDays).sort((a, b) => {
      if (a === todayStr) return -1;
      if (b === todayStr) return 1;
      return new Date(a) - new Date(b);
    });
    
    const displayDayKeys = state.selectedDay ? dayKeys.filter(d => d === state.selectedDay) : dayKeys;
    
    displayDayKeys.forEach(dayStr => {
      const dayDate = new Date(dayStr + 'T00:00:00');
      const events = timelineDays[dayStr].sort((a, b) => a.time - b.time);
      
      timelineHTML += `
        <div class="timeline-day">
          <div class="timeline-day-header">
            ${dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div class="timeline-events">
            ${events.map(e => `
              <div class="timeline-event">
                ${e.isInterval 
                  ? `<span class="event-schedule-inline">${cronToEnglish(e.job.schedule)}</span>`
                  : `<span class="event-time">${formatTime12Hour(e.time)}</span>`
                }
                <div class="event-info">
                  <div class="event-name">${e.job.name}</div>
                  ${!e.isInterval ? `<div class="event-schedule">${cronToEnglish(e.job.schedule)}</div>` : ''}
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
        <div class="job-name">${job.name}</div>
        <span class="job-type ${job.type}">${job.type}</span>
      </div>
      <div class="job-meta">
        <span class="job-schedule">${cronToEnglish(job.schedule)}</span>
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
    document.getElementById('cpuUsage').textContent = system.cpu ? `${system.cpu}%` : '--';
    
    // Memory
    if (system.memory) {
      document.getElementById('memUsage').textContent = `${system.memory.used}MB (${system.memory.percent}%)`;
      document.getElementById('memFree').textContent = `${system.memory.total - system.memory.used}MB`;
    } else {
      document.getElementById('memUsage').textContent = '--';
      document.getElementById('memFree').textContent = '--';
    }
    
    // Format disk usage
    if (system.disk && system.disk.used && system.disk.total) {
      document.getElementById('diskUsage').textContent = `${system.disk.used}GB / ${system.disk.total}GB`;
    } else {
      document.getElementById('diskUsage').textContent = '--';
    }
  }
  
  // Remote Systems
  // Containers
  const systems = [
    { name: 'Umbrel (Pi)', ip: '10.0.0.147', port: null, status: remoteSystems.umbrel || 'unknown' },
    { name: 'GO Transit', ip: '10.0.0.115', port: 3001, status: remoteSystems.gotransit || 'unknown' }
  ];
  
  // Containers
  const containersList = document.getElementById('containersList');
  if (containersList && state.containers && state.containers.containers) {
    const containers = state.containers.containers;
    containersList.innerHTML = containers.map(c => {
      const statusClass = c.status.includes('Up') ? 'running' : (c.status.includes('Restarting') ? 'restarting' : 'stopped');
      return `<div class="service-item">
        <span class="service-name">${c.name}</span>
        <span class="service-status ${statusClass}">
          ${c.status}
        </span>
      </div>`;
    }).join('');
  }

  const remoteList = document.getElementById("remoteSystemsList");
  remoteList.innerHTML = systems.map(sys => `
    <div class="service-item">
      <span class="service-name">${sys.name} (${sys.ip}${sys.port ? ':' + sys.port : ''})</span>
      <span class="service-status ${sys.status === 'running' ? 'running' : 'stopped'}">
        ${sys.status || 'unknown'}
      </span>
    </div>
  `).join('');
}

// ===== Loading =====
function setLoading(loading) {
  state.loading = loading;
  const btn = document.getElementById('refreshBtn');
  if (loading) {
    btn.classList.add('spinning');
  } else {
    btn.classList.remove('spinning');
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

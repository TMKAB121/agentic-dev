// Status dashboard: fetches /api/status and renders loading/success/error
// states per docs/specs/001-status-dashboard.md.
const badge = document.getElementById('status-badge');
const uptimeEl = document.getElementById('status-uptime');
const checkedEl = document.getElementById('status-checked');
const messageEl = document.getElementById('status-message');
const refreshButton = document.getElementById('refresh-button');

function formatUptime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours >= 1 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

function setLoading() {
  badge.className = 'badge badge--loading';
  badge.textContent = 'Checking…';
  messageEl.textContent = '';
  refreshButton.disabled = true;
}

function setSuccess(data) {
  badge.className = 'badge badge--ok';
  badge.textContent = data.status === 'ok' ? 'OK' : data.status;
  uptimeEl.textContent = formatUptime(data.uptimeSeconds);
  checkedEl.textContent = new Date(data.timestamp).toLocaleTimeString();
  messageEl.textContent = '';
}

function setError() {
  badge.className = 'badge badge--error';
  badge.textContent = 'Unreachable';
  uptimeEl.textContent = '—';
  checkedEl.textContent = '—';
  messageEl.textContent = 'Could not reach the service. Use Refresh to retry.';
}

async function refresh() {
  setLoading();
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setSuccess(await response.json());
  } catch {
    setError();
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', refresh);
refresh();

const state = {
  vms: [],
  editingId: null,
  token: localStorage.getItem('vmms-token') || '',
  user: JSON.parse(localStorage.getItem('vmms-user') || 'null'),
  monitorTimerId: null
};

const loginShell = document.getElementById('login-shell');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutButton = document.getElementById('logout-btn');
const whoamiName = document.getElementById('whoami-name');
const whoamiRole = document.getElementById('whoami-role');
const monitorCard = document.getElementById('monitor-card');
const monitorTitle = document.getElementById('monitor-title');
const refreshMonitorButton = document.getElementById('refresh-monitor-btn');
const monitorUpdatedAt = document.getElementById('monitor-updated-at');
const monitorVmTableBody = document.getElementById('monitor-vm-table-body');
const monitorScopeNote = document.getElementById('monitor-scope-note');
const monitorHostGrid = document.getElementById('monitor-host-grid');
const hostCapacityGrid = document.getElementById('host-capacity-grid');
const hostCpuLabel = document.getElementById('host-cpu-label');
const hostRamLabel = document.getElementById('host-ram-label');
const hostDiskLabel = document.getElementById('host-disk-label');
const hostNetInLabel = document.getElementById('host-net-in-label');
const hostNetOutLabel = document.getElementById('host-net-out-label');
const cpuCapacityLabel = document.getElementById('cpu-capacity-label');
const ramCapacityLabel = document.getElementById('ram-capacity-label');
const diskCapacityLabel = document.getElementById('disk-capacity-label');
const hostCpu = document.getElementById('host-cpu');
const hostRam = document.getElementById('host-ram');
const hostDisk = document.getElementById('host-disk');
const hostNetIn = document.getElementById('host-net-in');
const hostNetOut = document.getElementById('host-net-out');
const cpuPie = document.getElementById('cpu-pie');
const cpuPieLabel = document.getElementById('cpu-pie-label');
const cpuUsedCores = document.getElementById('cpu-used-cores');
const cpuFreeCores = document.getElementById('cpu-free-cores');
const cpuTotalCores = document.getElementById('cpu-total-cores');
const ramPie = document.getElementById('ram-pie');
const ramPieLabel = document.getElementById('ram-pie-label');
const ramUsed = document.getElementById('ram-used');
const ramFree = document.getElementById('ram-free');
const ramTotal = document.getElementById('ram-total');
const diskPie = document.getElementById('disk-pie');
const diskPieLabel = document.getElementById('disk-pie-label');
const diskUsed = document.getElementById('disk-used');
const diskFree = document.getElementById('disk-free');
const diskTotal = document.getElementById('disk-total');
const diskSourceNote = document.getElementById('disk-source-note');
const hypervisorConfigCard = document.getElementById('hypervisor-config-card');
const hypervisorSettingsModal = document.getElementById('hypervisor-settings-modal');
const closeHypervisorModalButton = document.getElementById('close-hypervisor-modal');
const hypervisorConfigForm = document.getElementById('hypervisor-config-form');
const reloadHypervisorConfigButton = document.getElementById('reload-hypervisor-config-btn');
const testHypervisorButton = document.getElementById('test-hypervisor-btn');
const hypervisorConfigStatus = document.getElementById('hypervisor-config-status');

const hvEnabled = document.getElementById('hv-enabled');
const hvType = document.getElementById('hv-type');
const hvBaseUrl = document.getElementById('hv-base-url');
const hvInsecureTls = document.getElementById('hv-insecure-tls');
const hvAuthMode = document.getElementById('hv-auth-mode');
const hvUsername = document.getElementById('hv-username');
const hvTokenId = document.getElementById('hv-token-id');
const hvTokenSecret = document.getElementById('hv-token-secret');
const hvPassword = document.getElementById('hv-password');
const hvRealm = document.getElementById('hv-realm');
const hvNode = document.getElementById('hv-node');
const hvPollInterval = document.getElementById('hv-poll-interval');
const hypervisorNavButton = document.getElementById('nav-hypervisor-settings');
const usersNavButton = document.getElementById('nav-users');

const vmForm = document.getElementById('vm-form');
const vmEditModal = document.getElementById('vm-edit-modal');
const closeVmModalButton = document.getElementById('close-vm-modal');
const metricsSection = document.getElementById('metrics-section');
const vmAccessEmailInput = document.getElementById('vm-access-email');
const vmAccessUsernameInput = document.getElementById('vm-access-username');
const vmAccessPasswordInput = document.getElementById('vm-access-password');
const formTitle = document.getElementById('vm-edit-title');
const vmTableBody = document.getElementById('vm-table-body');
const searchInput = document.getElementById('search');
const statusFilter = document.getElementById('status-filter');
const providerFilter = document.getElementById('provider-filter');
const cancelEditButton = document.getElementById('cancel-edit');
const syncVmsButton = document.getElementById('sync-vms-btn');
const printReportButton = document.getElementById('print-report-btn');
const reportOwnerTableBody = document.getElementById('report-owner-table-body');
const reportVmTableBody = document.getElementById('report-vm-table-body');
const reportTitleMeta = document.getElementById('report-title-meta');
const inventorySection = document.getElementById('inventory-section');
const reportCard = document.getElementById('report-card');
const usersSection = document.getElementById('users-section');
const userForm = document.getElementById('user-form');
const userTableBody = document.getElementById('user-table-body');
const userFormTitle = document.getElementById('user-form-title');
const userIdInput = document.getElementById('user-id');
const userNameInput = document.getElementById('user-name');
const userUsernameInput = document.getElementById('user-username');
const userRoleInput = document.getElementById('user-role');
const userPasswordInput = document.getElementById('user-password');
const userAllowedVmIdsInput = document.getElementById('user-allowed-vm-ids');
const cancelUserFormButton = document.getElementById('cancel-user-form');
const newUserButton = document.getElementById('new-user-btn');
const userStatTotal = document.getElementById('user-stat-total');
const userStatActive = document.getElementById('user-stat-active');
const userStatLocked = document.getElementById('user-stat-locked');
const userStatAdmins = document.getElementById('user-stat-admins');

function hasRole(...roles) {
  return state.user && roles.includes(state.user.role);
}

function canViewMonitor() {
  return hasRole('admin', 'operator', 'viewer');
}

function canViewHostMonitor() {
  return hasRole('admin', 'operator', 'viewer');
}

function setAuth(token, user) {
  state.token = token || '';
  state.user = user || null;
  if (state.token) {
    localStorage.setItem('vmms-token', state.token);
  } else {
    localStorage.removeItem('vmms-token');
  }

  if (state.user) {
    localStorage.setItem('vmms-user', JSON.stringify(state.user));
  } else {
    localStorage.removeItem('vmms-user');
  }
}

function showLogin() {
  loginShell.classList.remove('hidden');
  appShell.classList.add('hidden');
}

function showApp() {
  loginShell.classList.add('hidden');
  appShell.classList.remove('hidden');
}

function updateRoleView() {
  if (!state.user) return;

  whoamiName.textContent = state.user.name || state.user.username;

  const canManageInventory = hasRole('admin');
  syncVmsButton.classList.toggle('hidden', !canManageInventory);
  hypervisorNavButton.classList.toggle('hidden', !canManageInventory);
  usersNavButton.classList.toggle('hidden', !canManageInventory);
  if (newUserButton) {
    newUserButton.classList.toggle('hidden', !canManageInventory);
  }

  monitorCard.classList.toggle('hidden', !canViewMonitor());
  monitorHostGrid.classList.toggle('hidden', !canViewHostMonitor());
  hostCapacityGrid.classList.toggle('hidden', !canViewHostMonitor());
  closeHypervisorModal();

  if (state.user.role === 'viewer') {
    monitorScopeNote.textContent = 'Showing live resource usage for your assigned VMs only.';
  } else {
    monitorScopeNote.textContent = 'Showing full hypervisor and VM telemetry.';
  }
}

function closeHypervisorModal() {
  if (hypervisorSettingsModal) {
    hypervisorSettingsModal.classList.add('hidden');
  }
}

function closeVmEditModal() {
  if (vmEditModal) {
    vmEditModal.classList.add('hidden');
  }
}

function openVmEditModal() {
  if (vmEditModal) {
    vmEditModal.classList.remove('hidden');
  }
}

function openHypervisorModal() {
  if (hypervisorSettingsModal) {
    hypervisorSettingsModal.classList.remove('hidden');
  }
}

function setHypervisorStatus(message, isError = false) {
  hypervisorConfigStatus.textContent = message;
  hypervisorConfigStatus.classList.toggle('error', Boolean(isError));
}

function fillHypervisorForm(config) {
  hvEnabled.checked = Boolean(config.enabled);
  hvType.value = config.type || 'proxmox';
  hvBaseUrl.value = config.baseUrl || '';
  hvInsecureTls.checked = Boolean(config.insecureTls);
  hvAuthMode.value = config.authMode || 'apiToken';
  hvUsername.value = config.username || '';
  hvTokenId.value = config.tokenId || '';
  hvRealm.value = config.realm || 'pam';
  hvNode.value = config.node || '';
  hvPollInterval.value = Number(config.pollIntervalMs || 5000);
  hvTokenSecret.value = '';
  hvPassword.value = '';

  const secrets = [];
  if (config.hasTokenSecret) secrets.push('token secret saved');
  if (config.hasPassword) secrets.push('password saved');
  if (!secrets.length) secrets.push('no secret stored yet');
  setHypervisorStatus(`Loaded configuration (${secrets.join(', ')}).`);
}

function readHypervisorFormPayload() {
  return {
    enabled: hvEnabled.checked,
    type: hvType.value,
    baseUrl: hvBaseUrl.value,
    insecureTls: hvInsecureTls.checked,
    authMode: hvAuthMode.value,
    username: hvUsername.value,
    tokenId: hvTokenId.value,
    tokenSecret: hvTokenSecret.value,
    password: hvPassword.value,
    realm: hvRealm.value,
    node: hvNode.value,
    pollIntervalMs: Number(hvPollInterval.value || 5000)
  };
}

async function loadHypervisorConfig() {
  if (!hasRole('admin')) {
    return;
  }

  const config = await fetchJson('/api/hypervisor/config');
  fillHypervisorForm(config);
}

async function saveHypervisorConfig() {
  const payload = readHypervisorFormPayload();
  const config = await fetchJson('/api/hypervisor/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  fillHypervisorForm(config);
  setHypervisorStatus('Configuration saved successfully.');
}

async function testHypervisorConfig() {
  const result = await fetchJson('/api/hypervisor/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  setHypervisorStatus(`Connection OK. Source: ${result.source}. VM metrics mapped: ${result.vmCount}.`);
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'running') return 'status running';
  if (value === 'stopped') return 'status stopped';
  if (value === 'restarting') return 'status restarting';
  return 'status error';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatHypervisor(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '-';
  }
  if (normalized.toLowerCase() === 'xcp') {
    return 'XCP';
  }
  return normalized;
}

async function fetchJson(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const body = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      setAuth('', null);
      showLogin();
    }
    const errorText = [body.error, body.hint].filter(Boolean).join(' ');
    throw new Error(errorText || 'Request failed');
  }

  return body;
}

async function loadVms() {
  state.vms = await fetchJson('/api/vms');
  renderVms();
}

async function loadUsers() {
  if (!hasRole('admin')) {
    if (userTableBody) {
      userTableBody.innerHTML = '<tr><td colspan="7">Admin access required.</td></tr>';
    }
    return;
  }

  const users = await fetchJson('/api/users');
  const total = users.length;
  const active = users.filter(user => user.status === 'active').length;
  const locked = users.filter(user => user.status === 'locked').length;
  const admins = users.filter(user => user.role === 'admin').length;

  if (userStatTotal) userStatTotal.textContent = total;
  if (userStatActive) userStatActive.textContent = active;
  if (userStatLocked) userStatLocked.textContent = locked;
  if (userStatAdmins) userStatAdmins.textContent = admins;

  userTableBody.innerHTML = '';

  if (!users.length) {
    userTableBody.innerHTML = '<tr><td colspan="7">No users found.</td></tr>';
    return;
  }

  for (const user of users) {
    const row = document.createElement('tr');
    const statusClassName = user.status === 'locked' ? 'locked' : user.status === 'suspended' ? 'suspended' : 'active';
    const allowedVmIds = Array.isArray(user.allowedVmIds) && user.allowedVmIds.length ? user.allowedVmIds.join(', ') : 'All';
    const lastLogin = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never';

    row.innerHTML = `
      <td>
        <strong>${user.name || user.username}</strong><br>
        <span class="muted">@${user.username}</span>
      </td>
      <td>${user.role}</td>
      <td><span class="user-status-pill ${statusClassName}">${user.status}</span></td>
      <td>${lastLogin}</td>
      <td>${user.failedLoginAttempts || 0}</td>
      <td>${allowedVmIds}</td>
      <td>
        <div class="action-group">
          <button data-user-action="edit" data-user-id="${user.id}" class="secondary">Edit</button>
          <button data-user-action="${user.status === 'locked' ? 'unlock' : 'lock'}" data-user-id="${user.id}">${user.status === 'locked' ? 'Unlock' : 'Lock'}</button>
          <button data-user-action="reset" data-user-id="${user.id}" class="danger">Reset</button>
        </div>
      </td>
    `;
    userTableBody.appendChild(row);
  }
}

function resetUserForm() {
  userForm.reset();
  userIdInput.value = '';
  userPasswordInput.value = '';
  userAllowedVmIdsInput.value = '';
  userFormTitle.textContent = 'Create User';
}

function fillUserForm(user) {
  userIdInput.value = String(user.id);
  userNameInput.value = user.name || '';
  userUsernameInput.value = user.username || '';
  userRoleInput.value = user.role || 'viewer';
  userPasswordInput.value = '';
  userAllowedVmIdsInput.value = Array.isArray(user.allowedVmIds) ? user.allowedVmIds.join(', ') : '';
  userFormTitle.textContent = `Edit User: ${user.username}`;
}

function getUserFormPayload() {
  const password = userPasswordInput.value.trim();
  const allowedVmIds = userAllowedVmIdsInput.value
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value > 0);

  return {
    name: userNameInput.value.trim(),
    username: userUsernameInput.value.trim(),
    role: userRoleInput.value,
    allowedVmIds,
    ...(password ? { password } : {})
  };
}

async function syncVmsFromHypervisor() {
  const result = await fetchJson('/api/vms/sync-from-hypervisor', {
    method: 'POST'
  });

  await loadVms();
  await loadSummary();
  if (canViewMonitor()) {
    await loadMonitor();
  }

  return result;
}

async function updateReportTitleMeta() {
  if (!reportTitleMeta) {
    return;
  }

  const parts = [];

  try {
    const config = await fetchJson('/api/hypervisor/config');
    const hypervisorName = String(config.type || 'Proxmox').trim();
    if (hypervisorName) {
      parts.push(`Hypervisor: ${hypervisorName.charAt(0).toUpperCase()}${hypervisorName.slice(1)}`);
    }

    const systemInfo = await fetchJson('/api/system/info').catch(() => ({}));
    const privateIp = String(systemInfo.privateIp || '').trim();
    const configHostname = String(config.node || '').trim();
    const serverName = privateIp || configHostname || (config.baseUrl ? new URL(config.baseUrl).hostname : '') || window.location.hostname || 'localhost';
    if (serverName) {
      parts.push(`Server: ${serverName}`);
    }
  } catch {
    const fallbackServer = window.location.hostname || 'localhost';
    parts.push(`Server: ${fallbackServer}`);
  }

  reportTitleMeta.textContent = parts.length ? `(${parts.join(', ')})` : '';
}

async function loadSummary() {
  const summary = await fetchJson('/api/summary');
  let host = {};

  if (canViewMonitor()) {
    try {
      const monitor = await fetchJson('/api/monitor/live');
      host = monitor.host || {};
    } catch {
      host = {};
    }
  }

  await updateReportTitleMeta();

  document.getElementById('metric-total').textContent = summary.total;
  document.getElementById('metric-running').textContent = summary.running;
  document.getElementById('metric-stopped').textContent = summary.stopped;
  document.getElementById('metric-error').textContent = summary.error;
  renderReport({ ...summary, host });
}

function formatGb(value) {
  return `${Number(value || 0).toFixed(1)} GB`;
}

function renderReport(summary) {
  const host = summary.host || {};
  const cpuTotal = Number(host.cpuTotalCores || summary.totalCpuCores || 0);
  const cpuUsed = Number(host.cpuUsedCores || 0);
  const cpuFree = Math.max(0, cpuTotal - cpuUsed);
  const cpuPct = cpuTotal > 0 ? Math.min(100, (cpuUsed / cpuTotal) * 100) : 0;

  const ramTotalGb = Number(host.ramTotalBytes ? (host.ramTotalBytes / (1024 ** 3)) : (summary.totalRamGb || 0));
  const ramUsedGb = Number(host.ramUsedBytes ? (host.ramUsedBytes / (1024 ** 3)) : 0);
  const ramFreeGb = Math.max(0, ramTotalGb - ramUsedGb);
  const ramPct = ramTotalGb > 0 ? Math.min(100, (ramUsedGb / ramTotalGb) * 100) : 0;

  const diskTotalGb = Number(host.diskTotalBytes ? (host.diskTotalBytes / (1024 ** 3)) : (summary.totalDiskGb || 0));
  const diskUsedGb = Number(host.diskUsedBytes ? (host.diskUsedBytes / (1024 ** 3)) : 0);
  const diskFreeGb = Math.max(0, diskTotalGb - diskUsedGb);
  const diskPct = diskTotalGb > 0 ? Math.min(100, (diskUsedGb / diskTotalGb) * 100) : 0;

  document.getElementById('report-cpu-used').textContent = `${cpuPct.toFixed(1)}%`;
  document.getElementById('report-cpu-details').textContent = `${cpuUsed.toFixed(1)} cores used / ${cpuTotal.toFixed(1)} total`;
  document.getElementById('report-ram-used').textContent = `${ramPct.toFixed(1)}%`;
  document.getElementById('report-ram-details').textContent = `${formatGb(ramUsedGb)} used / ${formatGb(ramTotalGb)} total`;
  document.getElementById('report-disk-used').textContent = `${diskPct.toFixed(1)}%`;
  document.getElementById('report-disk-details').textContent = `${formatGb(diskUsedGb)} used / ${formatGb(diskTotalGb)} total`;

  document.getElementById('report-resource-cpu').textContent = `${cpuFree.toFixed(1)} cores left`;
  document.getElementById('report-resource-ram').textContent = `${formatGb(ramFreeGb)} left`;
  document.getElementById('report-resource-disk').textContent = `${formatGb(diskFreeGb)} left`;

  const ownerData = new Map();
  for (const vm of state.vms) {
    const owner = (vm.owner || 'Unassigned').trim() || 'Unassigned';
    if (!ownerData.has(owner)) {
      ownerData.set(owner, { owner, vms: 0, cpu: 0, ram: 0, disk: 0 });
    }
    const row = ownerData.get(owner);
    row.vms += 1;
    row.cpu += Number(vm.cpuCores || 0);
    row.ram += Number(vm.ramGb || 0);
    row.disk += Number(vm.diskGb || 0);
  }

  const rows = [...ownerData.values()].sort((a, b) => b.cpu + b.ram + b.disk - (a.cpu + a.ram + a.disk));
  reportOwnerTableBody.innerHTML = '';

  if (!rows.length) {
    reportOwnerTableBody.innerHTML = '<tr><td colspan="5">No ownership data available.</td></tr>';
  } else {
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.owner}</td>
        <td>${row.vms}</td>
        <td>${row.cpu} cores</td>
        <td>${row.ram} GB</td>
        <td>${row.disk} GB</td>
      `;
      reportOwnerTableBody.appendChild(tr);
    }
  }

  if (reportVmTableBody) {
    reportVmTableBody.innerHTML = '';
    const vmRows = [...state.vms].sort((a, b) => String(a.name).localeCompare(String(b.name)));

    if (!vmRows.length) {
      reportVmTableBody.innerHTML = '<tr><td colspan="8">No VMs available for reporting.</td></tr>';
      return;
    }

    for (const vm of vmRows) {
      const created = vm.createdAt ? new Date(vm.createdAt).toLocaleString() : 'Unknown';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${vm.name}</td>
        <td>${vm.owner || 'Unassigned'}</td>
        <td>${formatHypervisor(vm.provider)}</td>
        <td><span class="${statusClass(vm.status)}">${vm.status}</span></td>
        <td>${created}</td>
        <td>${Number(vm.cpuCores || 0)} vCPU</td>
        <td>${Number(vm.ramGb || 0)} GB</td>
        <td>${Number(vm.diskGb || 0)} GB</td>
      `;
      reportVmTableBody.appendChild(tr);
    }
  }
}

function showSection(target) {
  if (target === 'users' && !hasRole('admin')) {
    target = 'dashboard';
  }

  const showDashboard = target === 'dashboard';
  const showInventory = target === 'inventory';
  const showReports = target === 'reports';
  const showUsers = target === 'users';

  if (metricsSection) {
    metricsSection.classList.toggle('hidden', !showDashboard);
  }
  if (inventorySection) {
    inventorySection.classList.toggle('hidden', !showInventory);
  }
  if (usersSection) {
    usersSection.classList.toggle('hidden', !showUsers);
  }
  if (reportCard) {
    reportCard.classList.toggle('hidden', !showReports);
  }
  if (monitorCard) {
    monitorCard.classList.toggle('hidden', !showDashboard || !canViewMonitor());
  }
  if (monitorHostGrid) {
    monitorHostGrid.classList.toggle('hidden', !showDashboard || !canViewHostMonitor());
  }
  if (hostCapacityGrid) {
    hostCapacityGrid.classList.toggle('hidden', !showDashboard || !canViewHostMonitor());
  }
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatMbps(value) {
  return `${Number(value || 0).toFixed(1)} Mbps`;
}

function formatStorage(bytes) {
  const value = Number(bytes || 0);
  const gb = 1024 ** 3;
  const tb = 1024 ** 4;
  if (value >= tb) {
    return `${(value / tb).toFixed(2)} TB`;
  }
  return `${(value / gb).toFixed(2)} GB`;
}

function setPieUsage(element, labelElement, usedValue, totalValue) {
  const total = Number(totalValue || 0);
  const used = Math.max(0, Number(usedValue || 0));
  const pct = total > 0 ? Math.max(0, Math.min(100, (used / total) * 100)) : 0;
  element.style.setProperty('--used', `${pct.toFixed(1)}%`);
  labelElement.textContent = `${pct.toFixed(1)}%`;
}

function getViewerAssignedVmSummary(vmMetrics) {
  if (!Array.isArray(vmMetrics) || !state.user || state.user.role !== 'viewer') {
    return null;
  }

  const allowedIds = new Set((state.user.allowedVmIds || []).map(Number).filter(Number.isFinite));
  const assignedMetrics = vmMetrics.filter(item => allowedIds.has(Number(item.vmId)));
  const assignedVms = state.vms.filter(vm => allowedIds.has(Number(vm.id)));

  if (!assignedVms.length || !assignedMetrics.length) {
    return {
      cpuUsage: 0,
      ramUsage: 0,
      diskUsage: 0,
      networkInMbps: 0,
      networkOutMbps: 0,
      cpuTotalCores: 0,
      cpuUsedCores: 0,
      cpuFreeCores: 0,
      ramTotalBytes: 0,
      ramUsedBytes: 0,
      ramFreeBytes: 0,
      diskTotalBytes: 0,
      diskUsedBytes: 0,
      diskFreeBytes: 0,
      diskSource: 'assigned-vms',
      storagePoolCount: assignedVms.length,
      timestamp: new Date().toISOString()
    };
  }

  const metricsByVm = new Map(assignedMetrics.map(item => [Number(item.vmId), item]));
  const totalCpuCores = assignedVms.reduce((sum, vm) => sum + Number(vm.cpuCores || 0), 0);
  const totalRamBytes = assignedVms.reduce((sum, vm) => sum + Number(vm.ramGb || 0) * 1024 ** 3, 0);
  const totalDiskBytes = assignedVms.reduce((sum, vm) => sum + Number(vm.diskGb || 0) * 1024 ** 3, 0);

  let usedCpuCores = 0;
  let usedRamBytes = 0;
  let usedDiskBytes = 0;
  let networkInMbps = 0;
  let networkOutMbps = 0;

  for (const vm of assignedVms) {
    const metric = metricsByVm.get(Number(vm.id)) || {};
    const cpuPercent = Number(metric.cpuUsage || 0) / 100;
    const ramPercent = Number(metric.ramUsage || 0) / 100;
    const diskPercent = Number(metric.diskUsage || 0) / 100;
    const vmCpuCores = Number(vm.cpuCores || 0);
    const vmRamBytes = Number(vm.ramGb || 0) * 1024 ** 3;
    const vmDiskBytes = Number(vm.diskGb || 0) * 1024 ** 3;

    usedCpuCores += vmCpuCores * cpuPercent;
    usedRamBytes += vmRamBytes * ramPercent;
    usedDiskBytes += vmDiskBytes * diskPercent;
    networkInMbps += Number(metric.networkInMbps || 0);
    networkOutMbps += Number(metric.networkOutMbps || 0);
  }

  return {
    cpuUsage: totalCpuCores > 0 ? (usedCpuCores / totalCpuCores) * 100 : 0,
    ramUsage: totalRamBytes > 0 ? (usedRamBytes / totalRamBytes) * 100 : 0,
    diskUsage: totalDiskBytes > 0 ? (usedDiskBytes / totalDiskBytes) * 100 : 0,
    networkInMbps,
    networkOutMbps,
    cpuTotalCores: totalCpuCores,
    cpuUsedCores: usedCpuCores,
    cpuFreeCores: Math.max(0, totalCpuCores - usedCpuCores),
    ramTotalBytes: totalRamBytes,
    ramUsedBytes: usedRamBytes,
    ramFreeBytes: Math.max(0, totalRamBytes - usedRamBytes),
    diskTotalBytes: totalDiskBytes,
    diskUsedBytes: usedDiskBytes,
    diskFreeBytes: Math.max(0, totalDiskBytes - usedDiskBytes),
    diskSource: 'assigned-vms',
    storagePoolCount: assignedVms.length,
    timestamp: new Date().toISOString()
  };
}

function renderHostCapacity(host) {
  if (!host || !canViewHostMonitor()) {
    return;
  }

  const totalCpu = Number(host.cpuTotalCores || 0);
  const usedCpu = Number(host.cpuUsedCores || ((host.cpuUsage || 0) / 100) * totalCpu);
  const freeCpu = Number(host.cpuFreeCores || Math.max(0, totalCpu - usedCpu));

  const totalRamBytes = Number(host.ramTotalBytes || 0);
  const usedRamBytes = Number(host.ramUsedBytes || 0);
  const freeRamBytes = Number(host.ramFreeBytes || Math.max(0, totalRamBytes - usedRamBytes));

  const totalDiskBytes = Number(host.diskTotalBytes || 0);
  const usedDiskBytes = Number(host.diskUsedBytes || 0);
  const freeDiskBytes = Number(host.diskFreeBytes || Math.max(0, totalDiskBytes - usedDiskBytes));

  setPieUsage(cpuPie, cpuPieLabel, usedCpu, totalCpu || 1);
  cpuUsedCores.textContent = `Used: ${usedCpu.toFixed(2)} cores`;
  cpuFreeCores.textContent = `Free: ${freeCpu.toFixed(2)} cores`;
  cpuTotalCores.textContent = `Total: ${totalCpu.toFixed(2)} cores`;

  setPieUsage(ramPie, ramPieLabel, usedRamBytes, totalRamBytes || 1);
  ramUsed.textContent = `Used: ${formatStorage(usedRamBytes)}`;
  ramFree.textContent = `Free: ${formatStorage(freeRamBytes)}`;
  ramTotal.textContent = `Total: ${formatStorage(totalRamBytes)}`;

  setPieUsage(diskPie, diskPieLabel, usedDiskBytes, totalDiskBytes || 1);
  diskUsed.textContent = `Used: ${formatStorage(usedDiskBytes)}`;
  diskFree.textContent = `Free: ${formatStorage(freeDiskBytes)}`;
  diskTotal.textContent = `Total: ${formatStorage(totalDiskBytes)}`;

  const source = String(host.diskSource || 'unknown');
  if (source === 'storage-pools') {
    const poolCount = Number(host.storagePoolCount || 0);
    diskSourceNote.textContent = `Source: Storage Pools (${poolCount} visible)`;
  } else if (source === 'rootfs-fallback') {
    diskSourceNote.textContent = 'Source: RootFS fallback (storage pools not visible to token)';
  } else if (source === 'simulated') {
    diskSourceNote.textContent = 'Source: Simulated';
  } else if (source === 'assigned-vms') {
    const vmCount = Number(host.storagePoolCount || 0);
    diskSourceNote.textContent = `Source: Assigned VMs (${vmCount} visible)`;
  } else {
    diskSourceNote.textContent = 'Source: Unknown';
  }
}

function renderMonitor(snapshot) {
  const vmMetrics = Array.isArray(snapshot.vmMetrics) ? snapshot.vmMetrics : [];
  const host = snapshot.host;
  const sourceLabel = snapshot.source === 'proxmox' ? 'Proxmox' : 'Simulated';
  const isViewer = hasRole('viewer');

  if (monitorTitle) {
    monitorTitle.textContent = isViewer ? 'VMs Live Monitor' : 'Hypervisor Live Monitor';
  }

  if (monitorScopeNote) {
    monitorScopeNote.textContent = isViewer
      ? 'Assigned VM telemetry only: showing live usage for your authorized machines.'
      : state.user && state.user.role === 'viewer'
        ? 'Showing live resource usage for your assigned VMs only.'
        : 'Showing full hypervisor and VM telemetry.';
  }

  if (hostCpuLabel) hostCpuLabel.textContent = isViewer ? 'Assigned VM CPU' : 'Host CPU';
  if (hostRamLabel) hostRamLabel.textContent = isViewer ? 'Assigned VM RAM' : 'Host RAM';
  if (hostDiskLabel) hostDiskLabel.textContent = isViewer ? 'Assigned VM Disk' : 'Host Disk';
  if (hostNetInLabel) hostNetInLabel.textContent = isViewer ? 'VM Inbound Net' : 'Inbound Net';
  if (hostNetOutLabel) hostNetOutLabel.textContent = isViewer ? 'VM Outbound Net' : 'Outbound Net';
  if (cpuCapacityLabel) cpuCapacityLabel.textContent = isViewer ? 'Assigned VM CPU Capacity' : 'Host CPU Capacity';
  if (ramCapacityLabel) ramCapacityLabel.textContent = isViewer ? 'Assigned VM RAM Capacity' : 'Host RAM Capacity';
  if (diskCapacityLabel) diskCapacityLabel.textContent = isViewer ? 'Assigned VM Disk Capacity' : 'Host Disk Capacity';

  const viewerSummary = isViewer ? getViewerAssignedVmSummary(vmMetrics) : null;
  const monitorSource = viewerSummary || host;

  if (monitorSource && canViewHostMonitor()) {
    hostCpu.textContent = formatPct(viewerSummary ? viewerSummary.cpuUsage : host.cpuUsage);
    hostRam.textContent = formatPct(viewerSummary ? viewerSummary.ramUsage : host.ramUsage);
    hostDisk.textContent = formatPct(viewerSummary ? viewerSummary.diskUsage : host.diskUsage);
    hostNetIn.textContent = formatMbps(viewerSummary ? viewerSummary.networkInMbps : host.networkInMbps);
    hostNetOut.textContent = formatMbps(viewerSummary ? viewerSummary.networkOutMbps : host.networkOutMbps);
    monitorUpdatedAt.textContent = `Updated ${formatDateTime(viewerSummary ? viewerSummary.timestamp : host.timestamp)} • Source: ${sourceLabel}`;
  } else {
    monitorUpdatedAt.textContent = `Updated from assigned VM telemetry • Source: ${sourceLabel}`;
  }

  renderHostCapacity(viewerSummary || host);

  monitorVmTableBody.innerHTML = '';
  if (!vmMetrics.length) {
    monitorVmTableBody.innerHTML = '<tr><td colspan="7">No monitor data for assigned VMs.</td></tr>';
    return;
  }

  for (const item of vmMetrics) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.vmName || item.vmId}</td>
      <td><span class="${statusClass(item.status)}">${item.status || '-'}</span></td>
      <td>${formatPct(item.cpuUsage)}</td>
      <td>${formatPct(item.ramUsage)}</td>
      <td>${formatPct(item.diskUsage)}</td>
      <td>${formatMbps(item.ioReadMbps)}</td>
      <td>${formatMbps(item.ioWriteMbps)}</td>
    `;
    monitorVmTableBody.appendChild(row);
  }
}

async function loadMonitor() {
  if (!canViewMonitor()) {
    return;
  }

  const monitor = await fetchJson('/api/monitor/live');
  renderMonitor(monitor);
}

function stopMonitorPolling() {
  if (state.monitorTimerId) {
    clearInterval(state.monitorTimerId);
    state.monitorTimerId = null;
  }
}

function startMonitorPolling() {
  stopMonitorPolling();
  if (!canViewMonitor()) {
    return;
  }

  state.monitorTimerId = setInterval(() => {
    loadMonitor().catch(() => {
      // Keep polling even if a single refresh fails.
    });
  }, 5000);
}

function renderVms() {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value.trim().toLowerCase();
  const provider = providerFilter.value.trim().toLowerCase();

  const filtered = state.vms.filter(vm => {
    const haystack = [vm.name, vm.provider, vm.os, vm.owner, vm.ip]
      .join(' ')
      .toLowerCase();
    const matchSearch = !search || haystack.includes(search);
    const matchStatus = !status || String(vm.status || '').toLowerCase() === status;
    const matchProvider = !provider || String(vm.provider || '').toLowerCase() === provider;
    return matchSearch && matchStatus && matchProvider;
  });

  vmTableBody.innerHTML = '';

  if (!filtered.length) {
    vmTableBody.innerHTML = '<tr><td colspan="10">No VMs found.</td></tr>';
    return;
  }

  for (const vm of filtered) {
    const canOperate = hasRole('admin', 'operator');
    const canEdit = hasRole('admin');

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${vm.name}</td>
      <td><span class="${statusClass(vm.status)}">${vm.status}</span></td>
      <td>${formatHypervisor(vm.provider)}</td>
      <td>${vm.os}</td>
      <td>${vm.ip || '-'}</td>
      <td>${vm.cpuCores}</td>
      <td>${vm.ramGb} GB</td>
      <td>${vm.diskGb} GB</td>
      <td>${vm.owner || '-'}</td>
      <td>
        <div class="action-group">
          ${canOperate ? `<button data-action="start" data-id="${vm.id}">Start</button>` : ''}
          ${canOperate ? `<button data-action="stop" data-id="${vm.id}">Stop</button>` : ''}
          ${canOperate ? `<button data-action="restart" data-id="${vm.id}">Restart</button>` : ''}
          ${canEdit ? `<button data-action="edit" data-id="${vm.id}" class="secondary">Edit</button>` : ''}
          ${canEdit ? `<button data-action="delete" data-id="${vm.id}" class="danger">Delete</button>` : ''}
          ${!canOperate && !canEdit ? '<span class="muted">Read-only</span>' : ''}
        </div>
      </td>
    `;
    vmTableBody.appendChild(row);
  }
}

function resetForm() {
  vmForm.reset();
  document.getElementById('vm-id').value = '';
  document.getElementById('status').value = 'running';
  document.getElementById('cpuCores').value = 2;
  document.getElementById('ramGb').value = 4;
  document.getElementById('diskGb').value = 40;
  if (vmAccessEmailInput) vmAccessEmailInput.value = '';
  if (vmAccessUsernameInput) vmAccessUsernameInput.value = '';
  if (vmAccessPasswordInput) vmAccessPasswordInput.value = '';
  formTitle.textContent = 'Edit VM';
  state.editingId = null;
  closeVmEditModal();
}

function fillForm(vm) {
  document.getElementById('vm-id').value = vm.id;
  document.getElementById('name').value = vm.name || '';
  document.getElementById('provider').value = vm.provider || '';
  document.getElementById('os').value = vm.os || '';
  document.getElementById('ip').value = vm.ip || '';
  document.getElementById('status').value = vm.status || 'running';
  document.getElementById('cpuCores').value = vm.cpuCores || 2;
  document.getElementById('ramGb').value = vm.ramGb || 4;
  document.getElementById('diskGb').value = vm.diskGb || 40;
  document.getElementById('owner').value = vm.owner || '';
  if (vmAccessEmailInput) vmAccessEmailInput.value = '';
  if (vmAccessUsernameInput) vmAccessUsernameInput.value = '';
  if (vmAccessPasswordInput) vmAccessPasswordInput.value = '';
  formTitle.textContent = `Edit VM: ${vm.name || 'VM'}`;
  state.editingId = vm.id;
  openVmEditModal();
}

function getFormPayload() {
  return {
    name: document.getElementById('name').value,
    provider: document.getElementById('provider').value,
    os: document.getElementById('os').value,
    ip: document.getElementById('ip').value,
    status: document.getElementById('status').value,
    cpuCores: Number(document.getElementById('cpuCores').value),
    ramGb: Number(document.getElementById('ramGb').value),
    diskGb: Number(document.getElementById('diskGb').value),
    owner: document.getElementById('owner').value,
    vmAccessEmail: vmAccessEmailInput ? vmAccessEmailInput.value.trim() : '',
    vmAccessUsername: vmAccessUsernameInput ? vmAccessUsernameInput.value.trim() : '',
    vmAccessPassword: vmAccessPasswordInput ? vmAccessPasswordInput.value.trim() : ''
  };
}

async function refreshData() {
  await loadVms();
  await loadSummary();
  await loadMonitor();
  if (hasRole('admin')) {
    await loadUsers();
    await loadHypervisorConfig();
  }
}

async function initializeSession() {
  if (!state.token) {
    showLogin();
    return;
  }

  try {
    const me = await fetchJson('/api/auth/me');
    state.user = me.user;
    localStorage.setItem('vmms-user', JSON.stringify(state.user));
    updateRoleView();
    showApp();
    await refreshData();
    startMonitorPolling();
    resetForm();
  } catch {
    setAuth('', null);
    stopMonitorPolling();
    showLogin();
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  try {
    const login = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    setAuth(login.token, login.user);
    updateRoleView();
    showApp();
    showSection('dashboard');
    await refreshData();
    startMonitorPolling();
    resetForm();
    loginForm.reset();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await fetchJson('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore and continue local logout
  }

  setAuth('', null);
  stopMonitorPolling();
  showLogin();
});

vmForm.addEventListener('submit', async event => {
  event.preventDefault();

  try {
    const payload = getFormPayload();
    const method = state.editingId ? 'PUT' : 'POST';
    const url = state.editingId ? `/api/vms/${state.editingId}` : '/api/vms';

    await fetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    resetForm();
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

vmTableBody.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const vm = state.vms.find(item => item.id === id);

  if (!vm) {
    return;
  }

  try {
    if (action === 'edit') {
      fillForm(vm);
      return;
    }

    if (action === 'delete') {
      await fetchJson(`/api/vms/${id}`, { method: 'DELETE' });
      await refreshData();
      return;
    }

    if (['start', 'stop', 'restart'].includes(action)) {
      await fetchJson(`/api/vms/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      await refreshData();
    }
  } catch (error) {
    alert(error.message);
  }
});

refreshMonitorButton.addEventListener('click', loadMonitor);
reloadHypervisorConfigButton.addEventListener('click', () => {
  loadHypervisorConfig().catch(error => {
    setHypervisorStatus(error.message, true);
  });
});

if (hypervisorNavButton) {
  hypervisorNavButton.addEventListener('click', async () => {
    document.querySelectorAll('.nav-item').forEach(button => {
      button.classList.toggle('active', button === hypervisorNavButton);
    });
    openHypervisorModal();
    try {
      await loadHypervisorConfig();
    } catch (error) {
      setHypervisorStatus(error.message, true);
    }
  });
}

if (closeVmModalButton) {
  closeVmModalButton.addEventListener('click', resetForm);
}

if (closeHypervisorModalButton) {
  closeHypervisorModalButton.addEventListener('click', closeHypervisorModal);
}

if (vmEditModal) {
  vmEditModal.addEventListener('click', event => {
    if (event.target === vmEditModal) {
      resetForm();
    }
  });
}

if (hypervisorSettingsModal) {
  hypervisorSettingsModal.addEventListener('click', event => {
    if (event.target === hypervisorSettingsModal) {
      closeHypervisorModal();
    }
  });
}

document.querySelector('[data-target="dashboard"]').addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.target === 'dashboard');
  });
  showSection('dashboard');
  closeHypervisorModal();
});

document.querySelector('[data-target="inventory"]').addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.target === 'inventory');
  });
  showSection('inventory');
  closeHypervisorModal();
});

document.querySelector('[data-target="reports"]').addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.target === 'reports');
  });
  showSection('reports');
  closeHypervisorModal();
});

if (usersNavButton) {
  usersNavButton.addEventListener('click', () => {
    if (!hasRole('admin')) {
      showSection('dashboard');
      return;
    }
    document.querySelectorAll('.nav-item').forEach(button => {
      button.classList.toggle('active', button.dataset.target === 'users');
    });
    showSection('users');
    closeHypervisorModal();
    loadUsers().catch(error => alert(error.message));
  });
}

function downloadReportPdf() {
  const container = document.getElementById('report-card');
  const actionBar = document.querySelector('#report-card .report-actions');
  if (!container) {
    return;
  }

  const fallbackPrint = () => {
    const originalTitle = document.title;
    document.title = 'VM-Management-Report';
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  };

  if (!window.jspdf || !window.html2canvas) {
    fallbackPrint();
    return;
  }

  const previousDisplay = container.style.display;
  const previousVisibility = container.style.visibility;
  const previousActionDisplay = actionBar ? actionBar.style.display : null;
  container.style.display = 'block';
  container.style.visibility = 'visible';
  if (actionBar) {
    actionBar.style.display = 'none';
  }

  window.html2canvas(container, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true
  }).then(canvas => {
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pageWidth - (margin * 2);
      const imgHeight = canvas.height * (imgWidth / canvas.width);
      let remainingHeight = imgHeight;
      let offsetY = 0;

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, imgHeight);
      remainingHeight -= (pageHeight - (margin * 2));

      while (remainingHeight > 0) {
        pdf.addPage();
        offsetY -= (pageHeight - (margin * 2));
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin + offsetY, imgWidth, imgHeight);
        remainingHeight -= (pageHeight - (margin * 2));
      }

      pdf.save('vm-management-report.pdf');
    } finally {
      container.style.display = previousDisplay;
      container.style.visibility = previousVisibility;
      if (actionBar) {
        actionBar.style.display = previousActionDisplay;
      }
    }
  }).catch(() => {
    container.style.display = previousDisplay;
    container.style.visibility = previousVisibility;
    if (actionBar) {
      actionBar.style.display = previousActionDisplay;
    }
    fallbackPrint();
  });
}

if (printReportButton) {
  printReportButton.addEventListener('click', downloadReportPdf);
}

userForm.addEventListener('submit', async event => {
  event.preventDefault();

  try {
    const payload = getUserFormPayload();
    const userId = userIdInput.value;

    if (!payload.name || !payload.username || !payload.role) {
      throw new Error('Full name, username, and role are required.');
    }

    if (userId) {
      await fetchJson(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      if (!payload.password || payload.password.trim().length < 4) {
        throw new Error('Password must be at least 4 characters long.');
      }

      await fetchJson('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    resetUserForm();
    await loadUsers();
  } catch (error) {
    alert(error.message);
  }
});

userTableBody.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;

  const userId = Number(button.dataset.userId);
  const action = button.dataset.userAction;

  try {
    if (action === 'edit') {
      const user = (await fetchJson('/api/users')).find(item => item.id === userId);
      if (user) {
        fillUserForm(user);
      }
      return;
    }

    if (['lock', 'unlock', 'reset'].includes(action)) {
      await fetchJson(`/api/users/${userId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      await loadUsers();
    }
  } catch (error) {
    alert(error.message);
  }
});

newUserButton.addEventListener('click', () => {
  resetUserForm();
  userNameInput.focus();
});

cancelUserFormButton.addEventListener('click', resetUserForm);

hypervisorConfigForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await saveHypervisorConfig();
  } catch (error) {
    setHypervisorStatus(error.message, true);
  }
});

testHypervisorButton.addEventListener('click', async () => {
  try {
    setHypervisorStatus('Testing Proxmox connection...');
    await testHypervisorConfig();
  } catch (error) {
    setHypervisorStatus(error.message, true);
  }
});
searchInput.addEventListener('input', renderVms);
statusFilter.addEventListener('change', renderVms);
providerFilter.addEventListener('change', renderVms);
cancelEditButton.addEventListener('click', resetForm);
syncVmsButton.addEventListener('click', async () => {
  try {
    syncVmsButton.disabled = true;
    syncVmsButton.textContent = 'Syncing...';
    await syncVmsFromHypervisor();
  } catch (error) {
    alert(error.message);
  } finally {
    syncVmsButton.disabled = false;
    syncVmsButton.textContent = 'Sync from Hypervisor';
  }
});

initializeSession();

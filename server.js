const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const vmDataFile = path.join(__dirname, 'data', 'vms.json');
const usersDataFile = path.join(__dirname, 'data', 'users.json');
const activityDataFile = path.join(__dirname, 'data', 'activity.json');
const emailDeliveriesFile = path.join(__dirname, 'data', 'email-deliveries.json');
const hypervisorDataFile = path.join(__dirname, 'data', 'hypervisor.json');
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const HASH_ITERATIONS = 150000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000;
const MONITOR_HISTORY_POINTS = 20;
const BYTES_PER_GIB = 1024 ** 3;
const monitorState = {
  initialized: false,
  host: {
    cpuUsage: 0,
    ramUsage: 0,
    diskUsage: 0,
    networkInMbps: 0,
    networkOutMbps: 0,
    timestamp: null
  },
  vmUsageById: {},
  history: []
};
const proxmoxState = {
  ticket: null,
  csrfToken: null,
  ticketExpiresAt: 0,
  previousHostCounter: null,
  previousVmCountersByVmid: {},
  history: []
};
const serverState = {
  lastVmSyncAt: 0
};

function ensureDataFiles() {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

  if (!fs.existsSync(vmDataFile)) {
    fs.writeFileSync(
      vmDataFile,
      JSON.stringify(
        [
          {
            id: 101,
            name: 'web-prod-01',
            provider: 'Proxmox',
            os: 'Ubuntu 24.04',
            ip: '10.20.0.11',
            status: 'running',
            cpuCores: 4,
            ramGb: 16,
            diskGb: 120,
            owner: 'Platform Team',
            createdAt: '2026-07-01T10:15:00.000Z',
            lastUpdatedAt: '2026-08-10T08:00:00.000Z'
          },
          {
            id: 102,
            name: 'db-staging-01',
            provider: 'Proxmox',
            os: 'Debian 12',
            ip: '10.20.10.45',
            status: 'stopped',
            cpuCores: 8,
            ramGb: 32,
            diskGb: 256,
            owner: 'Data Team',
            createdAt: '2026-07-22T09:30:00.000Z',
            lastUpdatedAt: '2026-08-08T16:40:00.000Z'
          },
          {
            id: 103,
            name: 'ci-runner-03',
            provider: 'XCP',
            os: 'Rocky Linux 9',
            ip: '10.30.4.88',
            status: 'error',
            cpuCores: 2,
            ramGb: 8,
            diskGb: 80,
            owner: 'DevOps',
            createdAt: '2026-08-02T13:05:00.000Z',
            lastUpdatedAt: '2026-08-10T06:05:00.000Z'
          }
        ],
        null,
        2
      )
    );
  }

  if (!fs.existsSync(usersDataFile)) {
    fs.writeFileSync(
      usersDataFile,
      JSON.stringify(
        [
          {
            id: 1,
            username: 'admin',
            password: 'admin123',
            role: 'admin',
            name: 'System Admin',
            allowedVmIds: []
          },
          {
            id: 2,
            username: 'operator',
            password: 'operator123',
            role: 'operator',
            name: 'Operations User',
            allowedVmIds: []
          },
          {
            id: 3,
            username: 'viewer',
            password: 'viewer123',
            role: 'viewer',
            name: 'Read-Only User',
            allowedVmIds: [101]
          }
        ],
        null,
        2
      )
    );
  }

  if (!fs.existsSync(activityDataFile)) {
    fs.writeFileSync(activityDataFile, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(emailDeliveriesFile)) {
    fs.writeFileSync(emailDeliveriesFile, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(hypervisorDataFile)) {
    fs.writeFileSync(
      hypervisorDataFile,
      JSON.stringify(
        {
          enabled: false,
          type: 'proxmox',
          baseUrl: 'https://proxmox.example.local:8006/api2/json',
          insecureTls: true,
          authMode: 'apiToken',
          username: 'root@pam',
          tokenId: 'vm-monitor',
          tokenSecret: 'replace-with-token-secret',
          password: 'replace-with-password-if-authMode-password',
          realm: 'pam',
          node: '',
          pollIntervalMs: 5000
        },
        null,
        2
      )
    );
  }
}

function readJson(filePath) {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readVms() {
  return readJson(vmDataFile);
}

function writeVms(vms) {
  writeJson(vmDataFile, vms);
}

function readUsers() {
  const users = readJson(usersDataFile);
  let changed = false;

  const migrated = users.map(user => {
    const nextUser = { ...user };

    if (!nextUser.passwordHash && typeof nextUser.password === 'string') {
      const hashed = hashPassword(nextUser.password);
      nextUser.passwordHash = hashed.hash;
      nextUser.passwordSalt = hashed.salt;
      delete nextUser.password;
      changed = true;
    }

    if (!Number.isInteger(nextUser.failedLoginAttempts)) {
      nextUser.failedLoginAttempts = 0;
      changed = true;
    }

    if (!Number.isFinite(nextUser.lockUntil)) {
      nextUser.lockUntil = 0;
      changed = true;
    }

    if (nextUser.lastLoginAt === undefined) {
      nextUser.lastLoginAt = null;
      changed = true;
    }

    if (!Array.isArray(nextUser.allowedVmIds)) {
      nextUser.allowedVmIds = nextUser.role === 'viewer' ? [101] : [];
      changed = true;
    }

    nextUser.allowedVmIds = nextUser.allowedVmIds
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value > 0);

    return nextUser;
  });

  if (changed) {
    writeJson(usersDataFile, migrated);
  }

  return migrated;
}

function writeUsers(users) {
  writeJson(usersDataFile, users);
}

function readHypervisorConfig() {
  const config = readJson(hypervisorDataFile);
  return {
    enabled: Boolean(config.enabled),
    type: String(config.type || 'proxmox').toLowerCase(),
    baseUrl: String(config.baseUrl || '').trim(),
    insecureTls: Boolean(config.insecureTls),
    authMode: String(config.authMode || 'apiToken').trim(),
    username: String(config.username || '').trim(),
    tokenId: String(config.tokenId || '').trim(),
    tokenSecret: String(config.tokenSecret || '').trim(),
    password: String(config.password || '').trim(),
    realm: String(config.realm || 'pam').trim(),
    node: String(config.node || '').trim(),
    pollIntervalMs: Math.max(1000, Number(config.pollIntervalMs || 5000))
  };
}

function writeHypervisorConfig(config) {
  writeJson(hypervisorDataFile, config);
}

function sanitizeHypervisorConfig(config) {
  return {
    enabled: Boolean(config.enabled),
    type: String(config.type || 'proxmox').toLowerCase(),
    baseUrl: String(config.baseUrl || '').trim(),
    insecureTls: Boolean(config.insecureTls),
    authMode: String(config.authMode || 'apiToken').trim(),
    username: String(config.username || '').trim(),
    tokenId: String(config.tokenId || '').trim(),
    tokenSecret: '',
    hasTokenSecret: Boolean(config.tokenSecret),
    password: '',
    hasPassword: Boolean(config.password),
    realm: String(config.realm || 'pam').trim(),
    node: String(config.node || '').trim(),
    pollIntervalMs: Math.max(1000, Number(config.pollIntervalMs || 5000))
  };
}

function mergeHypervisorConfig(existing, patch) {
  const authMode = patch.authMode !== undefined ? String(patch.authMode).trim() : existing.authMode;
  const next = {
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : existing.enabled,
    type: patch.type !== undefined ? String(patch.type).trim().toLowerCase() : existing.type,
    baseUrl: patch.baseUrl !== undefined ? String(patch.baseUrl).trim() : existing.baseUrl,
    insecureTls: patch.insecureTls !== undefined ? Boolean(patch.insecureTls) : existing.insecureTls,
    authMode,
    username: patch.username !== undefined ? String(patch.username).trim() : existing.username,
    tokenId: patch.tokenId !== undefined ? String(patch.tokenId).trim() : existing.tokenId,
    tokenSecret:
      patch.tokenSecret !== undefined && String(patch.tokenSecret).trim() !== ''
        ? String(patch.tokenSecret).trim()
        : existing.tokenSecret,
    password:
      patch.password !== undefined && String(patch.password).trim() !== ''
        ? String(patch.password).trim()
        : existing.password,
    realm: patch.realm !== undefined ? String(patch.realm).trim() : existing.realm,
    node: patch.node !== undefined ? String(patch.node).trim() : existing.node,
    pollIntervalMs:
      patch.pollIntervalMs !== undefined
        ? Math.max(1000, Number(patch.pollIntervalMs || 5000))
        : existing.pollIntervalMs
  };

  if (!['proxmox'].includes(next.type)) {
    throw new Error('Unsupported hypervisor type.');
  }

  if (!['apiToken', 'password'].includes(next.authMode)) {
    throw new Error('authMode must be apiToken or password.');
  }

  if (next.enabled && !next.baseUrl) {
    throw new Error('baseUrl is required when hypervisor integration is enabled.');
  }

  return next;
}

function resetProxmoxRuntimeState() {
  proxmoxState.ticket = null;
  proxmoxState.csrfToken = null;
  proxmoxState.ticketExpiresAt = 0;
  proxmoxState.previousHostCounter = null;
  proxmoxState.previousVmCountersByVmid = {};
  proxmoxState.history = [];
}

function readActivity() {
  return readJson(activityDataFile);
}

function writeActivity(entries) {
  writeJson(activityDataFile, entries.slice(0, 1000));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  const requestPath = req.url === '/' ? 'index.html' : req.url.replace(/^\/+/, '');
  const filePath = path.join(publicDir, requestPath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Not found' });
      } else {
        sendJson(res, 500, { error: 'Server error' });
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    res.end(content);
  });
}

function normalizeAllowedVmIds(input) {
  const values = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];

  return [...new Set(
    values
      .map(value => Number(String(value).trim()))
      .filter(value => Number.isInteger(value) && value > 0)
  )];
}

function getUserStatus(user) {
  const now = Date.now();
  const lockUntil = Number(user.lockUntil || 0);
  if (lockUntil > now) return 'locked';
  if (Number(user.failedLoginAttempts || 0) >= MAX_FAILED_LOGIN_ATTEMPTS) return 'suspended';
  return 'active';
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    role: user.role,
    name: user.name,
    lastLoginAt: user.lastLoginAt || null,
    allowedVmIds: Array.isArray(user.allowedVmIds) ? user.allowedVmIds : []
  };
}

function serializeUserForClient(user) {
  return {
    ...sanitizeUser(user),
    status: getUserStatus(user),
    failedLoginAttempts: Number(user.failedLoginAttempts || 0),
    lockUntil: Number(user.lockUntil || 0)
  };
}

function normalizeUserInput(data, existingUser = null) {
  const next = existingUser ? { ...existingUser } : {};

  if (data.username !== undefined) next.username = String(data.username).trim();
  if (data.email !== undefined) next.email = String(data.email || '').trim();
  if (data.name !== undefined) next.name = String(data.name).trim();
  if (data.role !== undefined) {
    const role = String(data.role).trim().toLowerCase();
    if (!['admin', 'operator', 'viewer'].includes(role)) {
      throw new Error('Role must be admin, operator, or viewer.');
    }
    next.role = role;
  }

  if (data.allowedVmIds !== undefined) {
    next.allowedVmIds = normalizeAllowedVmIds(data.allowedVmIds);
  }

  if (data.password !== undefined) {
    const password = String(data.password || '').trim();
    if (password) {
      const hashed = hashPassword(password);
      next.passwordHash = hashed.hash;
      next.passwordSalt = hashed.salt;
    }
  }

  if (data.failedLoginAttempts !== undefined) {
    next.failedLoginAttempts = Math.max(0, Number(data.failedLoginAttempts || 0));
  }

  if (data.lockUntil !== undefined) {
    next.lockUntil = Number(data.lockUntil || 0);
  }

  if (data.lastLoginAt !== undefined) {
    next.lastLoginAt = data.lastLoginAt || null;
  }

  return next;
}

function getAllowedVmIdsForUser(user) {
  if (user.role !== 'viewer') {
    return [];
  }
  return Array.isArray(user.allowedVmIds) ? user.allowedVmIds : [];
}

function getPortalBaseUrl() {
  return (process.env.APP_BASE_URL || process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function recordVmAccessDelivery({ to, vmName, vmId, username, password, portalUrl }) {
  const deliveries = JSON.parse(fs.readFileSync(emailDeliveriesFile, 'utf8'));
  const entry = {
    id: Date.now(),
    sentAt: new Date().toISOString(),
    to,
    vmName,
    vmId,
    username,
    password,
    portalUrl
  };
  deliveries.unshift(entry);
  fs.writeFileSync(emailDeliveriesFile, JSON.stringify(deliveries, null, 2));
  return entry;
}

function createVmViewerAccountForEdit(vm, accessData = {}) {
  if (!vm || !vm.id) {
    return null;
  }

  const email = String(accessData.email || '').trim();
  const username = String(accessData.username || '').trim();
  const password = String(accessData.password || '').trim();

  if (!email || !username || !password) {
    return null;
  }

  const users = readUsers();
  const vmId = Number(vm.id);
  const portalUrl = getPortalBaseUrl();
  let existingUser = users.find(user => user.username && user.username.toLowerCase() === username.toLowerCase());

  if (!existingUser) {
    existingUser = users.find(user => user.email && user.email.toLowerCase() === email.toLowerCase());
  }

  const nextUser = normalizeUserInput(
    {
      username,
      email,
      name: vm.owner || vm.name || username,
      role: 'viewer',
      password,
      allowedVmIds: [vmId]
    },
    existingUser || {
      id: Date.now(),
      failedLoginAttempts: 0,
      lockUntil: 0,
      lastLoginAt: null,
      allowedVmIds: []
    }
  );

  if (!existingUser) {
    users.push(nextUser);
  } else {
    const index = users.findIndex(user => user.id === existingUser.id);
    users[index] = nextUser;
  }

  writeUsers(users);

  const delivery = recordVmAccessDelivery({
    to: email,
    vmName: vm.name,
    vmId,
    username,
    password,
    portalUrl
  });

  logActivity(
    { user: { role: 'admin', username: 'system' } },
    'vm.user_access_created',
    'vm',
    vmId,
    `Created viewer account ${username} for ${vm.name} and emailed credentials to ${email}.`
  );

  return {
    user: serializeUserForClient(nextUser),
    portalUrl,
    delivery
  };
}

function canAccessVm(session, vm) {
  if (!vm) return false;
  if (session.user.role !== 'viewer') return true;
  return getAllowedVmIdsForUser(session.user).includes(Number(vm.id));
}

function getScopedVms(session, vms) {
  if (session.user.role !== 'viewer') {
    return vms;
  }

  const allowedIds = new Set(getAllowedVmIdsForUser(session.user));
  return vms.filter(vm => allowedIds.has(Number(vm.id)));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value)));
}

function jitter(value, delta, min = 0, max = 100) {
  const next = Number(value) + (Math.random() * 2 - 1) * delta;
  return Math.max(min, Math.min(max, next));
}

function calculateMbps(counter, previous, nowMs) {
  if (!Number.isFinite(counter) || !previous) {
    return 0;
  }

  const elapsedMs = Math.max(1, nowMs - previous.timestampMs);
  const deltaBytes = Math.max(0, Number(counter) - Number(previous.counterBytes || 0));
  const bitsPerSecond = (deltaBytes * 8 * 1000) / elapsedMs;
  return Number((bitsPerSecond / 1000000).toFixed(1));
}

function buildProxmoxApiTokenHeader(config) {
  if (!config.username || !config.tokenId || !config.tokenSecret) {
    throw new Error('Proxmox API token credentials are incomplete.');
  }
  return `PVEAPIToken=${config.username}!${config.tokenId}=${config.tokenSecret}`;
}

function encodeForm(data) {
  return Object.entries(data)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function proxmoxRequest(config, pathPart, options = {}) {
  return new Promise((resolve, reject) => {
    const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
    if (!baseUrl) {
      reject(new Error('Proxmox baseUrl is missing in hypervisor configuration.'));
      return;
    }

    const fullUrl = new URL(`${baseUrl}${pathPart}`);
    const isHttps = fullUrl.protocol === 'https:';
    const transport = isHttps ? require('https') : require('http');
    const requestOptions = {
      method: options.method || 'GET',
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: `${fullUrl.pathname}${fullUrl.search}`,
      headers: options.headers || {}
    };

    if (isHttps) {
      requestOptions.rejectUnauthorized = !config.insecureTls;
    }

    const request = transport.request(requestOptions, response => {
      let body = '';
      response.on('data', chunk => {
        body += chunk.toString();
      });
      response.on('end', () => {
        let parsed;
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          reject(new Error(`Failed to parse Proxmox response (${response.statusCode}).`));
          return;
        }

        if (response.statusCode >= 400) {
          const detail = parsed && parsed.errors ? JSON.stringify(parsed.errors) : (parsed.message || parsed.error || 'Request failed');
          reject(new Error(`Proxmox API error ${response.statusCode}: ${detail}`));
          return;
        }

        resolve(parsed);
      });
    });

    request.on('error', reject);

    if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
}

async function ensureProxmoxTicket(config) {
  if (proxmoxState.ticket && Date.now() < proxmoxState.ticketExpiresAt) {
    return;
  }

  if (!config.username || !config.password) {
    throw new Error('Proxmox username/password credentials are incomplete.');
  }

  const payload = encodeForm({
    username: config.username,
    password: config.password,
    realm: config.realm || 'pam'
  });

  const response = await proxmoxRequest(config, '/access/ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(payload)
    },
    body: payload
  });

  if (!response || !response.data || !response.data.ticket) {
    throw new Error('Proxmox authentication failed: missing ticket.');
  }

  proxmoxState.ticket = response.data.ticket;
  proxmoxState.csrfToken = response.data.CSRFPreventionToken || '';
  proxmoxState.ticketExpiresAt = Date.now() + 1000 * 60 * 60;
}

async function proxmoxGet(config, pathPart) {
  const authMode = String(config.authMode || 'apiToken').toLowerCase();
  const headers = {
    Accept: 'application/json'
  };

  if (authMode === 'password') {
    await ensureProxmoxTicket(config);
    headers.Cookie = `PVEAuthCookie=${proxmoxState.ticket}`;
  } else {
    headers.Authorization = buildProxmoxApiTokenHeader(config);
  }

  const response = await proxmoxRequest(config, pathPart, { method: 'GET', headers });
  return Array.isArray(response.data) || typeof response.data === 'object' ? response.data : [];
}

async function refreshVmInventoryIfDue() {
  const config = readHypervisorConfig();
  if (!config.enabled || config.type !== 'proxmox') {
    return readVms();
  }

  const intervalMs = Math.max(1000, Number(config.pollIntervalMs || 5000));
  const now = Date.now();
  if (now - serverState.lastVmSyncAt <= intervalMs) {
    return readVms();
  }

  try {
    const currentVms = readVms();
    const syncedVms = await syncProxmoxVmInventory(config, currentVms);
    if (syncedVms.length) {
      writeVms(syncedVms);
      serverState.lastVmSyncAt = now;
    }
  } catch (error) {
    // Keep the current inventory when the hypervisor is unreachable or returns no VMs.
  }

  return readVms();
}

function bytesToGb(bytes) {
  const value = Number(bytes || 0);
  return value > 0 ? Math.max(0, Math.round(value / BYTES_PER_GIB)) : 0;
}

function megabytesToGb(megabytes) {
  const value = Number(megabytes || 0);
  return value > 0 ? Math.max(0, Math.round(value / 1024)) : 0;
}

function formatHypervisorProvider(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'proxmox') return 'Proxmox';
  if (normalized === 'xcp') return 'XCP';
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Proxmox';
}

function estimateVmDiskUsageBytes(vmRecord) {
  const blockstat = vmRecord && vmRecord.blockstat ? vmRecord.blockstat : null;
  if (!blockstat || typeof blockstat !== 'object') {
    return 0;
  }

  const preferredDevices = ['scsi0', 'virtio0', 'sata0', 'ide0', 'scsi1', 'virtio1', 'sata1', 'ide1'];
  let diskStats = null;
  for (const device of preferredDevices) {
    if (blockstat[device]) {
      diskStats = blockstat[device];
      break;
    }
  }

  if (!diskStats) {
    diskStats = Object.values(blockstat)[0] || null;
  }

  if (!diskStats || typeof diskStats !== 'object') {
    return 0;
  }

  const highestOffset = Number(diskStats.wr_highest_offset || 0);
  const readBytes = Number(diskStats.rd_bytes || 0);
  const writeBytes = Number(diskStats.wr_bytes || 0);
  return Math.max(0, highestOffset, readBytes + writeBytes);
}

function normalizeVmName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseProxmoxIp(vmConfig) {
  const ipFields = [vmConfig.ipconfig0, vmConfig.ipconfig1, vmConfig.ipconfig2];
  for (const field of ipFields) {
    const text = String(field || '').trim();
    if (!text) continue;

    const match = text.match(/(?:^|,)\s*ip=([^,]+)/i);
    if (match && match[1]) {
      return match[1].split('/')[0].trim();
    }
  }

  return '';
}

function inferProxmoxOs(vmConfig) {
  const ostype = String(vmConfig.ostype || '').trim().toLowerCase();
  if (!ostype) {
    return 'Linux';
  }

  if (ostype.startsWith('win')) {
    return 'Windows Server 2022';
  }

  return 'Linux';
}

function buildSyncedVmRecord(existingVm, nodeName, vmSummary, vmConfig, hypervisorType) {
  const vmid = Number(vmSummary.vmid || vmConfig.vmid || 0);
  const nowIso = new Date().toISOString();
  const totalCpu = Number(vmSummary.cpus || vmConfig.cores || vmConfig.sockets || existingVm?.cpuCores || 1);
  const ramGb = vmSummary.maxmem > 0 ? bytesToGb(vmSummary.maxmem) : megabytesToGb(vmConfig.memory || existingVm?.ramGb || 0);
  const diskGb = vmSummary.maxdisk > 0 ? bytesToGb(vmSummary.maxdisk) : bytesToGb(vmConfig.maxdisk || existingVm?.diskGb || 0);
  const ip = parseProxmoxIp(vmConfig) || String(existingVm?.ip || '').trim();

  return {
    id: vmid,
    name: String(vmConfig.name || vmSummary.name || `vm-${vmid}`).trim(),
    provider: formatHypervisorProvider(hypervisorType),
    os: existingVm && existingVm.os ? String(existingVm.os).trim() : inferProxmoxOs(vmConfig),
    ip,
    status: String(vmSummary.status || vmConfig.status || 'stopped').trim().toLowerCase(),
    cpuCores: Math.max(1, Number(totalCpu || 1)),
    ramGb: Math.max(1, Number(ramGb || 1)),
    diskGb: Math.max(1, Number(diskGb || 1)),
    owner: existingVm && existingVm.owner ? existingVm.owner : 'Unassigned',
    createdAt: existingVm && existingVm.createdAt ? existingVm.createdAt : nowIso,
    lastUpdatedAt: nowIso,
    proxmoxVmid: vmid,
    proxmoxNode: nodeName
  };
}

async function syncProxmoxVmInventory(config, existingVms) {
  const resources = await proxmoxGet(config, '/cluster/resources?type=vm');
  const qemuResources = Array.isArray(resources)
    ? resources.filter(item => String(item.type || '').toLowerCase() === 'qemu')
    : [];

  const selectedResources = config.node
    ? qemuResources.filter(item => String(item.node || '').toLowerCase() === config.node.toLowerCase())
    : qemuResources;

  if (!selectedResources.length) {
    throw new Error('No Proxmox VMs were visible for the configured scope.');
  }

  const existingByVmid = new Map();
  const existingByName = new Map();

  for (const vm of existingVms) {
    const vmidHint = Number(vm.proxmoxVmid || vm.hypervisorVmid || 0);
    if (vmidHint > 0 && !existingByVmid.has(vmidHint)) {
      existingByVmid.set(vmidHint, vm);
    }

    const normalizedName = normalizeVmName(vm.name);
    if (normalizedName && !existingByName.has(normalizedName)) {
      existingByName.set(normalizedName, vm);
    }
  }

  function findExistingVmByName(normalizedName) {
    if (!normalizedName) {
      return null;
    }

    if (existingByName.has(normalizedName)) {
      return existingByName.get(normalizedName);
    }

    for (const [candidateName, candidateVm] of existingByName.entries()) {
      if (
        candidateName.startsWith(normalizedName) ||
        normalizedName.startsWith(candidateName) ||
        candidateName.includes(normalizedName) ||
        normalizedName.includes(candidateName)
      ) {
        return candidateVm;
      }
    }

    return null;
  }

  const records = [];

  for (const vmSummary of selectedResources) {
    const nodeName = String(vmSummary.node || '').trim();
    const vmid = Number(vmSummary.vmid || 0);
    if (!nodeName || !vmid) continue;

    const vmConfig = await proxmoxGet(config, `/nodes/${encodeURIComponent(nodeName)}/qemu/${encodeURIComponent(vmid)}/config`)
      .catch(() => ({}));
    const normalizedName = normalizeVmName(vmConfig.name || vmSummary.name || '');
    const existingVm = existingByVmid.get(vmid) || findExistingVmByName(normalizedName) || null;
    records.push(buildSyncedVmRecord(existingVm, nodeName, vmSummary, vmConfig, config.type));
  }

  records.sort((left, right) => {
    const nodeCompare = String(left.proxmoxNode || '').localeCompare(String(right.proxmoxNode || ''));
    if (nodeCompare !== 0) return nodeCompare;
    return Number(left.proxmoxVmid || 0) - Number(right.proxmoxVmid || 0);
  });

  return records;
}

function mapVmToProxmoxRecord(vm, proxmoxRecords) {
  const vmidHint = Number(vm.proxmoxVmid || vm.hypervisorVmid || 0);
  if (vmidHint > 0) {
    const byVmid = proxmoxRecords.find(item => Number(item.vmid) === vmidHint);
    if (byVmid) return byVmid;
  }

  const normalizedName = String(vm.name || '').trim().toLowerCase();
  if (!normalizedName) return null;
  return proxmoxRecords.find(item => String(item.name || '').trim().toLowerCase() === normalizedName) || null;
}

function aggregateHostUsage(nodes) {
  let totalCpuWeight = 0;
  let weightedCpu = 0;
  let totalCpuCores = 0;
  let usedCpuCores = 0;
  let totalMemory = 0;
  let usedMemory = 0;
  let totalRootFs = 0;
  let usedRootFs = 0;
  let totalNetIn = 0;
  let totalNetOut = 0;

  for (const node of nodes) {
    const maxcpu = Number(node.maxcpu || 0);
    const rawCpu = Number(node.cpu || 0);
    const cpuRatio = rawCpu <= 1 ? rawCpu : rawCpu / 100;
    const cpu = clampPercent(cpuRatio * 100);
    weightedCpu += cpu * Math.max(1, maxcpu);
    totalCpuWeight += Math.max(1, maxcpu);
    totalCpuCores += Math.max(0, maxcpu);
    usedCpuCores += Math.max(0, maxcpu) * Math.max(0, Math.min(1, cpuRatio));

    const maxmem = Number(node.maxmem || node.memory?.total || 0);
    const mem = Number(node.mem || node.memory?.used || 0);
    totalMemory += maxmem;
    usedMemory += mem;

    const maxdisk = Number(node.maxdisk || node.rootfs?.total || 0);
    const disk = Number(node.disk || node.rootfs?.used || 0);
    totalRootFs += maxdisk;
    usedRootFs += disk;

    totalNetIn += Number(node.netin || node.network?.in || 0);
    totalNetOut += Number(node.netout || node.network?.out || 0);
  }

  return {
    cpuUsage: totalCpuWeight > 0 ? clampPercent(weightedCpu / totalCpuWeight) : 0,
    cpuTotalCores: Number(totalCpuCores.toFixed(2)),
    cpuUsedCores: Number(usedCpuCores.toFixed(2)),
    cpuFreeCores: Number(Math.max(0, totalCpuCores - usedCpuCores).toFixed(2)),
    ramUsage: totalMemory > 0 ? clampPercent((usedMemory / totalMemory) * 100) : 0,
    ramTotalBytes: totalMemory,
    ramUsedBytes: usedMemory,
    ramFreeBytes: Math.max(0, totalMemory - usedMemory),
    diskUsage: totalRootFs > 0 ? clampPercent((usedRootFs / totalRootFs) * 100) : 0,
    diskTotalBytes: totalRootFs,
    diskUsedBytes: usedRootFs,
    diskFreeBytes: Math.max(0, totalRootFs - usedRootFs),
    netInCounter: totalNetIn,
    netOutCounter: totalNetOut
  };
}

function buildProxmoxHistoryPoint(hostUsage, nowIso, nowMs) {
  const previousHostCounter = proxmoxState.previousHostCounter;
  const networkInMbps = calculateMbps(hostUsage.netInCounter, previousHostCounter ? {
    counterBytes: previousHostCounter.netInCounter,
    timestampMs: previousHostCounter.timestampMs
  } : null, nowMs);
  const networkOutMbps = calculateMbps(hostUsage.netOutCounter, previousHostCounter ? {
    counterBytes: previousHostCounter.netOutCounter,
    timestampMs: previousHostCounter.timestampMs
  } : null, nowMs);

  proxmoxState.previousHostCounter = {
    netInCounter: hostUsage.netInCounter,
    netOutCounter: hostUsage.netOutCounter,
    timestampMs: nowMs
  };

  const historyPoint = {
    timestamp: nowIso,
    cpuUsage: Number(hostUsage.cpuUsage.toFixed(1)),
    ramUsage: Number(hostUsage.ramUsage.toFixed(1)),
    networkInMbps,
    networkOutMbps
  };

  proxmoxState.history.push(historyPoint);
  if (proxmoxState.history.length > MONITOR_HISTORY_POINTS) {
    proxmoxState.history.shift();
  }

  return historyPoint;
}

function computeProxmoxVmMetrics(vmRecord, nowMs) {
  const vmid = Number(vmRecord.vmid || 0);
  const currentNetIn = Number(vmRecord.netin || 0);
  const currentNetOut = Number(vmRecord.netout || 0);
  const currentRead = Number(vmRecord.diskread || 0);
  const currentWrite = Number(vmRecord.diskwrite || 0);
  const usedDiskBytesEstimate = estimateVmDiskUsageBytes(vmRecord);
  const previous = proxmoxState.previousVmCountersByVmid[vmid] || null;

  const ioReadMbps = calculateMbps(currentRead, previous ? {
    counterBytes: previous.diskread,
    timestampMs: previous.timestampMs
  } : null, nowMs);

  const ioWriteMbps = calculateMbps(currentWrite, previous ? {
    counterBytes: previous.diskwrite,
    timestampMs: previous.timestampMs
  } : null, nowMs);

  const networkInMbps = calculateMbps(currentNetIn, previous ? {
    counterBytes: previous.netin,
    timestampMs: previous.timestampMs
  } : null, nowMs);

  const networkOutMbps = calculateMbps(currentNetOut, previous ? {
    counterBytes: previous.netout,
    timestampMs: previous.timestampMs
  } : null, nowMs);

  proxmoxState.previousVmCountersByVmid[vmid] = {
    netin: currentNetIn,
    netout: currentNetOut,
    diskread: currentRead,
    diskwrite: currentWrite,
    timestampMs: nowMs
  };

  return {
    cpuUsage: clampPercent(Number(vmRecord.cpu || 0) * 100),
    ramUsage: Number(vmRecord.maxmem || 0) > 0 ? clampPercent((Number(vmRecord.mem || 0) / Number(vmRecord.maxmem || 1)) * 100) : 0,
    diskUsage: Number(vmRecord.maxdisk || 0) > 0
      ? clampPercent((Math.max(Number(vmRecord.disk || 0), usedDiskBytesEstimate) / Number(vmRecord.maxdisk || 1)) * 100)
      : 0,
    ioReadMbps,
    ioWriteMbps,
    networkInMbps,
    networkOutMbps
  };
}

async function getProxmoxMonitorSnapshot(config, scopedVms) {
  const nodes = await proxmoxGet(config, '/nodes');
  const selectedNodes = config.node
    ? nodes.filter(item => String(item.node || '').toLowerCase() === config.node.toLowerCase())
    : nodes;

  if (!selectedNodes.length) {
    throw new Error('No Proxmox node found for configured scope.');
  }

  const vmRecords = [];
  const nodeStats = [];
  const storageUsageByKey = new Map();

  for (const nodeItem of selectedNodes) {
    const nodeName = String(nodeItem.node || '').trim();
    if (!nodeName) {
      continue;
    }

    const status = await proxmoxGet(config, `/nodes/${encodeURIComponent(nodeName)}/status`);
    // Merge summary and status payload fields because Proxmox exposes usage keys in different shapes.
    nodeStats.push({
      ...status,
      maxcpu: Number(status.maxcpu || nodeItem.maxcpu || 0),
      maxmem: Number(status.maxmem || status.memory?.total || nodeItem.maxmem || 0),
      mem: Number(status.mem || status.memory?.used || nodeItem.mem || 0),
      maxdisk: Number(status.maxdisk || status.rootfs?.total || nodeItem.maxdisk || 0),
      disk: Number(status.disk || status.rootfs?.used || nodeItem.disk || 0),
      netin: Number(status.netin || nodeItem.netin || 0),
      netout: Number(status.netout || nodeItem.netout || 0)
    });

    const qemuList = await proxmoxGet(config, `/nodes/${encodeURIComponent(nodeName)}/qemu`);
    for (const vm of qemuList) {
      const current = await proxmoxGet(config, `/nodes/${encodeURIComponent(nodeName)}/qemu/${encodeURIComponent(vm.vmid)}/status/current`).catch(() => ({}));
      vmRecords.push({ ...vm, ...current, node: nodeName });
    }

    // Pull storage pools to represent actual host capacity beyond rootfs.
    const storages = await proxmoxGet(config, `/nodes/${encodeURIComponent(nodeName)}/storage`);
    for (const storage of storages) {
      const total = Number(storage.total || 0);
      const used = Number(storage.used || 0);
      const available = Number(storage.avail || Math.max(0, total - used));
      if (!Number.isFinite(total) || total <= 0) {
        continue;
      }

      const storageName = String(storage.storage || storage.id || 'unknown');
      const isShared = Number(storage.shared || 0) === 1;
      const key = isShared ? `shared:${storageName}` : `node:${nodeName}:${storageName}`;
      const previous = storageUsageByKey.get(key);
      if (!previous || total > previous.total) {
        storageUsageByKey.set(key, {
          total,
          used: Math.max(0, Math.min(total, used)),
          free: Math.max(0, Math.min(total, available))
        });
      }
    }
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const hostUsage = aggregateHostUsage(nodeStats);
  const hasStoragePoolMetrics = storageUsageByKey.size > 0;

  if (hasStoragePoolMetrics) {
    let diskTotalBytes = 0;
    let diskUsedBytes = 0;
    let diskFreeBytes = 0;
    for (const usage of storageUsageByKey.values()) {
      diskTotalBytes += Number(usage.total || 0);
      diskUsedBytes += Number(usage.used || 0);
      diskFreeBytes += Number(usage.free || 0);
    }

    hostUsage.diskTotalBytes = diskTotalBytes;
    hostUsage.diskUsedBytes = Math.max(0, Math.min(diskTotalBytes, diskUsedBytes));
    hostUsage.diskFreeBytes = Math.max(0, Math.min(diskTotalBytes, diskFreeBytes));
    hostUsage.diskUsage = diskTotalBytes > 0
      ? clampPercent((hostUsage.diskUsedBytes / diskTotalBytes) * 100)
      : hostUsage.diskUsage;
  }

  const historyPoint = buildProxmoxHistoryPoint(hostUsage, nowIso, nowMs);

  const vmMetrics = scopedVms.map(vm => {
    const vmRecord = mapVmToProxmoxRecord(vm, vmRecords);
    if (!vmRecord) {
      return {
        vmId: vm.id,
        vmName: vm.name,
        status: vm.status,
        cpuUsage: 0,
        ramUsage: 0,
        diskUsage: 0,
        ioReadMbps: 0,
        ioWriteMbps: 0,
        networkInMbps: 0,
        networkOutMbps: 0,
        timestamp: nowIso,
        source: 'unmapped'
      };
    }

    const usage = computeProxmoxVmMetrics(vmRecord, nowMs);
    return {
      vmId: vm.id,
      vmName: vm.name,
      status: String(vmRecord.status || vm.status || 'unknown').toLowerCase(),
      ...usage,
      timestamp: nowIso,
      source: 'proxmox',
      proxmox: {
        vmid: Number(vmRecord.vmid || 0),
        node: String(vmRecord.node || '')
      }
    };
  });

  return {
    host: {
      cpuUsage: Number(hostUsage.cpuUsage.toFixed(1)),
      cpuTotalCores: hostUsage.cpuTotalCores,
      cpuUsedCores: Number(hostUsage.cpuUsedCores.toFixed(2)),
      cpuFreeCores: Number(hostUsage.cpuFreeCores.toFixed(2)),
      ramUsage: Number(hostUsage.ramUsage.toFixed(1)),
      ramTotalBytes: hostUsage.ramTotalBytes,
      ramUsedBytes: hostUsage.ramUsedBytes,
      ramFreeBytes: hostUsage.ramFreeBytes,
      diskUsage: Number(hostUsage.diskUsage.toFixed(1)),
      diskTotalBytes: hostUsage.diskTotalBytes,
      diskUsedBytes: hostUsage.diskUsedBytes,
      diskFreeBytes: hostUsage.diskFreeBytes,
      diskSource: hasStoragePoolMetrics ? 'storage-pools' : 'rootfs-fallback',
      storagePoolCount: storageUsageByKey.size,
      networkInMbps: historyPoint.networkInMbps,
      networkOutMbps: historyPoint.networkOutMbps,
      timestamp: nowIso
    },
    vmMetrics,
    history: proxmoxState.history,
    source: 'proxmox'
  };
}

function initializeMonitorState(vms) {
  if (monitorState.initialized) {
    return;
  }

  monitorState.host = {
    cpuUsage: 32,
    ramUsage: 46,
    diskUsage: 58,
    networkInMbps: 120,
    networkOutMbps: 92,
    timestamp: new Date().toISOString()
  };

  for (const vm of vms) {
    monitorState.vmUsageById[vm.id] = {
      cpuUsage: clampPercent(20 + Math.random() * 55),
      ramUsage: clampPercent(25 + Math.random() * 60),
      diskUsage: clampPercent(30 + Math.random() * 50),
      ioReadMbps: Math.max(1, Number((8 + Math.random() * 36).toFixed(1))),
      ioWriteMbps: Math.max(1, Number((6 + Math.random() * 28).toFixed(1))),
      timestamp: new Date().toISOString()
    };
  }

  monitorState.initialized = true;
}

function updateMonitorState(vms) {
  initializeMonitorState(vms);

  for (const vm of vms) {
    if (!monitorState.vmUsageById[vm.id]) {
      monitorState.vmUsageById[vm.id] = {
        cpuUsage: clampPercent(20 + Math.random() * 55),
        ramUsage: clampPercent(25 + Math.random() * 60),
        diskUsage: clampPercent(30 + Math.random() * 50),
        ioReadMbps: Math.max(1, Number((8 + Math.random() * 36).toFixed(1))),
        ioWriteMbps: Math.max(1, Number((6 + Math.random() * 28).toFixed(1))),
        timestamp: new Date().toISOString()
      };
    }
  }

  monitorState.host.cpuUsage = clampPercent(jitter(monitorState.host.cpuUsage, 6));
  monitorState.host.ramUsage = clampPercent(jitter(monitorState.host.ramUsage, 3));
  monitorState.host.diskUsage = clampPercent(jitter(monitorState.host.diskUsage, 1.2));
  monitorState.host.networkInMbps = Math.max(1, Number(jitter(monitorState.host.networkInMbps, 22, 1, 2000).toFixed(1)));
  monitorState.host.networkOutMbps = Math.max(1, Number(jitter(monitorState.host.networkOutMbps, 18, 1, 2000).toFixed(1)));
  monitorState.host.timestamp = new Date().toISOString();

  for (const vm of vms) {
    const metrics = monitorState.vmUsageById[vm.id];
    const running = String(vm.status || '').toLowerCase() === 'running';

    if (!running) {
      metrics.cpuUsage = clampPercent(jitter(metrics.cpuUsage, 5, 0, 20));
      metrics.ramUsage = clampPercent(jitter(metrics.ramUsage, 4, 0, 35));
      metrics.ioReadMbps = Math.max(0, Number(jitter(metrics.ioReadMbps, 3, 0, 80).toFixed(1)));
      metrics.ioWriteMbps = Math.max(0, Number(jitter(metrics.ioWriteMbps, 3, 0, 80).toFixed(1)));
    } else {
      metrics.cpuUsage = clampPercent(jitter(metrics.cpuUsage, 10));
      metrics.ramUsage = clampPercent(jitter(metrics.ramUsage, 8));
      metrics.ioReadMbps = Math.max(0.3, Number(jitter(metrics.ioReadMbps, 7, 0.3, 500).toFixed(1)));
      metrics.ioWriteMbps = Math.max(0.3, Number(jitter(metrics.ioWriteMbps, 6, 0.3, 500).toFixed(1)));
    }

    metrics.diskUsage = clampPercent(jitter(metrics.diskUsage, 0.7));
    metrics.timestamp = monitorState.host.timestamp;
  }

  const currentPoint = {
    timestamp: monitorState.host.timestamp,
    cpuUsage: Number(monitorState.host.cpuUsage.toFixed(1)),
    ramUsage: Number(monitorState.host.ramUsage.toFixed(1)),
    networkInMbps: monitorState.host.networkInMbps,
    networkOutMbps: monitorState.host.networkOutMbps
  };
  monitorState.history.push(currentPoint);
  if (monitorState.history.length > MONITOR_HISTORY_POINTS) {
    monitorState.history.shift();
  }
}

function getMonitorSnapshot(vms) {
  updateMonitorState(vms);

  const simulatedCpuTotalCores = 64;
  const simulatedCpuUsedCores = Number(((monitorState.host.cpuUsage / 100) * simulatedCpuTotalCores).toFixed(2));
  const simulatedCpuFreeCores = Number((simulatedCpuTotalCores - simulatedCpuUsedCores).toFixed(2));
  const simulatedRamTotalBytes = 256 * 1024 * 1024 * 1024;
  const simulatedRamUsedBytes = Math.round((monitorState.host.ramUsage / 100) * simulatedRamTotalBytes);
  const simulatedRamFreeBytes = simulatedRamTotalBytes - simulatedRamUsedBytes;
  const simulatedDiskTotalBytes = 4 * 1024 * 1024 * 1024 * 1024;
  const simulatedDiskUsedBytes = Math.round((monitorState.host.diskUsage / 100) * simulatedDiskTotalBytes);
  const simulatedDiskFreeBytes = simulatedDiskTotalBytes - simulatedDiskUsedBytes;

  return {
    host: {
      cpuUsage: Number(monitorState.host.cpuUsage.toFixed(1)),
      cpuTotalCores: simulatedCpuTotalCores,
      cpuUsedCores: simulatedCpuUsedCores,
      cpuFreeCores: simulatedCpuFreeCores,
      ramUsage: Number(monitorState.host.ramUsage.toFixed(1)),
      ramTotalBytes: simulatedRamTotalBytes,
      ramUsedBytes: simulatedRamUsedBytes,
      ramFreeBytes: simulatedRamFreeBytes,
      diskUsage: Number(monitorState.host.diskUsage.toFixed(1)),
      diskTotalBytes: simulatedDiskTotalBytes,
      diskUsedBytes: simulatedDiskUsedBytes,
      diskFreeBytes: simulatedDiskFreeBytes,
      diskSource: 'simulated',
      storagePoolCount: 0,
      networkInMbps: monitorState.host.networkInMbps,
      networkOutMbps: monitorState.host.networkOutMbps,
      timestamp: monitorState.host.timestamp
    },
    vmMetrics: vms.map(vm => ({
      vmId: vm.id,
      vmName: vm.name,
      status: vm.status,
      ...(monitorState.vmUsageById[vm.id] || {
        cpuUsage: 0,
        ramUsage: 0,
        diskUsage: 0,
        ioReadMbps: 0,
        ioWriteMbps: 0,
        timestamp: monitorState.host.timestamp
      })
    })),
    history: monitorState.history
  };
}

async function getLiveMonitorSnapshot(session, scopedVms) {
  const config = readHypervisorConfig();

  if (config.enabled && config.type === 'proxmox') {
    try {
      const proxmoxSnapshot = await getProxmoxMonitorSnapshot(config, scopedVms);
      return {
        ...proxmoxSnapshot,
        source: 'proxmox'
      };
    } catch (error) {
      logActivity(
        session,
        'monitor.proxmox_error',
        'hypervisor',
        config.baseUrl || 'proxmox',
        error.message
      );
    }
  }

  return {
    ...getMonitorSnapshot(scopedVms),
    source: 'simulated'
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(String(password), salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST)
    .toString('hex');
  return { salt, hash };
}

function verifyPassword(user, password) {
  if (!user.passwordHash || !user.passwordSalt) {
    return false;
  }

  const computed = hashPassword(password, user.passwordSalt).hash;
  const expectedBuffer = Buffer.from(user.passwordHash, 'hex');
  const actualBuffer = Buffer.from(computed, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function isUserLocked(user) {
  return Number(user.lockUntil || 0) > Date.now();
}

function getLockRemainingSeconds(user) {
  const remainingMs = Number(user.lockUntil || 0) - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function registerFailedLogin(user) {
  const nextAttempts = Number(user.failedLoginAttempts || 0) + 1;
  user.failedLoginAttempts = nextAttempts;

  if (nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    user.lockUntil = Date.now() + ACCOUNT_LOCKOUT_MS;
  }
}

function clearFailedLogin(user) {
  user.failedLoginAttempts = 0;
  user.lockUntil = 0;
}

function parseToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireAuth(req, res) {
  const token = parseToken(req);
  const session = getSession(token);
  if (!session) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return session;
}

function requireRole(res, session, allowedRoles) {
  if (!allowedRoles.includes(session.user.role)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return false;
  }
  return true;
}

function logActivity(session, action, targetType, targetId, details) {
  const activity = readActivity();
  const entry = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    actor: session ? sanitizeUser(session.user) : null,
    action,
    targetType,
    targetId,
    details
  };
  activity.unshift(entry);
  writeActivity(activity);
}

function getLocalPrivateIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const entries of Object.values(interfaces || {})) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue;
      candidates.push(entry.address);
    }
  }

  const preferred = candidates.find(ip => ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.'));
  return preferred || candidates[0] || 'localhost';
}

function isPrivateIpv4(value) {
  if (!value || typeof value !== 'string') return false;
  const ip = value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;

  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) && (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function getHypervisorHostFromConfig() {
  const config = readHypervisorConfig();
  const candidates = [];

  if (config.node) candidates.push(config.node);

  try {
    if (config.baseUrl) {
      const parsed = new URL(config.baseUrl);
      candidates.push(parsed.hostname);
    }
  } catch (error) {
    // Ignore malformed URLs and fall back to a safe default.
  }

  const explicitPrivate = candidates.find(value => isPrivateIpv4(value));
  if (explicitPrivate) return explicitPrivate;

  const explicitHost = candidates.find(value => value && !['localhost', '127.0.0.1', '0.0.0.0'].includes(value));
  return explicitHost || getLocalPrivateIp();
}

function getServerIdentity() {
  const config = readHypervisorConfig();
  const hypervisorHost = getHypervisorHostFromConfig();

  return {
    hostname: config.node || hypervisorHost || os.hostname(),
    privateIp: hypervisorHost || getLocalPrivateIp() || 'localhost'
  };
}

function getSummary(vms) {
  const summary = {
    total: vms.length,
    running: 0,
    stopped: 0,
    restarting: 0,
    error: 0,
    totalCpuCores: 0,
    totalRamGb: 0,
    totalDiskGb: 0
  };

  for (const vm of vms) {
    const status = (vm.status || '').toLowerCase();
    if (status in summary) {
      summary[status] += 1;
    }
    summary.totalCpuCores += Number(vm.cpuCores || 0);
    summary.totalRamGb += Number(vm.ramGb || 0);
    summary.totalDiskGb += Number(vm.diskGb || 0);
  }

  return summary;
}

function normalizeVmInput(data, existingVm = null) {
  const vm = existingVm ? { ...existingVm } : {};

  if (data.name !== undefined) vm.name = String(data.name).trim();
  if (data.provider !== undefined) vm.provider = String(data.provider).trim();
  if (data.os !== undefined) vm.os = String(data.os).trim();
  if (data.region !== undefined) vm.region = String(data.region).trim();
  if (data.ip !== undefined) vm.ip = String(data.ip).trim();
  if (data.status !== undefined) vm.status = String(data.status).trim().toLowerCase();
  if (data.owner !== undefined) vm.owner = String(data.owner).trim();

  if (data.cpuCores !== undefined) vm.cpuCores = Number(data.cpuCores || 0);
  if (data.ramGb !== undefined) vm.ramGb = Number(data.ramGb || 0);
  if (data.diskGb !== undefined) vm.diskGb = Number(data.diskGb || 0);

  if (data.tags !== undefined) {
    if (Array.isArray(data.tags)) {
      vm.tags = data.tags.map(tag => String(tag).trim()).filter(Boolean);
    } else {
      vm.tags = String(data.tags)
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);
    }
  }

  vm.lastUpdatedAt = new Date().toISOString();
  return vm;
}

function validateVm(vm) {
  if (!vm.name || !vm.provider || !vm.os) {
    return 'Name, provider, and OS are required.';
  }

  const validStatuses = ['running', 'stopped', 'restarting', 'error'];
  if (!validStatuses.includes(vm.status)) {
    return 'Status must be running, stopped, restarting, or error.';
  }

  if (vm.cpuCores < 1 || vm.ramGb < 1 || vm.diskGb < 1) {
    return 'CPU, RAM, and Disk values must be at least 1.';
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      try {
        const data = await parseBody(req);
        const username = String(data.username || '').trim();
        const password = String(data.password || '').trim();
        const users = readUsers();
        const user = users.find(item => item.username === username);

        if (!user) {
          logActivity(null, 'auth.login_failed', 'user', null, `Failed login for unknown user ${username || '<empty>'}.`);
          sendJson(res, 401, { error: 'Invalid credentials' });
          return;
        }

        if (isUserLocked(user)) {
          const remainingSeconds = getLockRemainingSeconds(user);
          sendJson(res, 423, {
            error: `Account locked. Try again in ${remainingSeconds} seconds.`
          });
          return;
        }

        if (!verifyPassword(user, password)) {
          registerFailedLogin(user);
          writeUsers(users);

          if (isUserLocked(user)) {
            logActivity(null, 'auth.locked', 'user', user.id, `User ${user.username} locked due to failed login attempts.`);
            sendJson(res, 423, {
              error: `Account locked. Try again in ${getLockRemainingSeconds(user)} seconds.`
            });
            return;
          }

          logActivity(null, 'auth.login_failed', 'user', user.id, `Failed login for user ${user.username}.`);
          sendJson(res, 401, {
            error: `Invalid credentials. ${Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - user.failedLoginAttempts)} attempt(s) left before lockout.`
          });
          return;
        }

        clearFailedLogin(user);
        user.lastLoginAt = new Date().toISOString();
        writeUsers(users);

        const token = crypto.randomBytes(24).toString('hex');
        const session = {
          token,
          user,
          createdAt: Date.now(),
          expiresAt: Date.now() + SESSION_TTL_MS
        };
        sessions.set(token, session);
        logActivity(session, 'auth.login', 'session', token, `User ${user.username} logged in.`);
        sendJson(res, 200, {
          token,
          user: sanitizeUser(user),
          expiresAt: session.expiresAt
        });
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const session = requireAuth(req, res);
      if (!session) return;
      const token = parseToken(req);
      sessions.delete(token);
      logActivity(session, 'auth.logout', 'session', token, `User ${session.user.username} logged out.`);
      sendJson(res, 200, { success: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      const session = requireAuth(req, res);
      if (!session) return;
      sendJson(res, 200, {
        user: sanitizeUser(session.user),
        expiresAt: session.expiresAt
      });
      return;
    }

    const session = requireAuth(req, res);
    if (!session) return;

    if (req.method === 'GET' && url.pathname === '/api/vms') {
      await refreshVmInventoryIfDue();
      const vms = getScopedVms(session, readVms());
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const status = (url.searchParams.get('status') || '').trim().toLowerCase();
      const provider = (url.searchParams.get('provider') || '').trim().toLowerCase();

      const filtered = vms.filter(vm => {
        const haystack = [vm.name, vm.provider, vm.os, vm.owner, vm.ip, ...(vm.tags || [])]
          .join(' ')
          .toLowerCase();
        const matchesSearch = !search || haystack.includes(search);
        const matchesStatus = !status || String(vm.status || '').toLowerCase() === status;
        const matchesProvider = !provider || String(vm.provider || '').toLowerCase() === provider;
        return matchesSearch && matchesStatus && matchesProvider;
      });

      sendJson(res, 200, filtered);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/summary') {
      await refreshVmInventoryIfDue();
      sendJson(res, 200, getSummary(getScopedVms(session, readVms())));
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/vms/')) {
      const id = Number(url.pathname.split('/')[3]);
      const vms = readVms();
      const vm = vms.find(item => item.id === id);
      if (!vm) {
        sendJson(res, 404, { error: 'VM not found' });
        return;
      }
      if (!canAccessVm(session, vm)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
      }
      sendJson(res, 200, vm);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/monitor/live') {
      const scopedVms = getScopedVms(session, readVms());
      const snapshot = await getLiveMonitorSnapshot(session, scopedVms);

      if (session.user.role === 'viewer') {
        sendJson(res, 200, {
          host: snapshot.host,
          vmMetrics: snapshot.vmMetrics,
          history: snapshot.history || [],
          scope: 'viewer-assigned-vms',
          source: snapshot.source
        });
        return;
      }

      sendJson(res, 200, {
        ...snapshot,
        scope: 'full'
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/activity') {
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 50)));
      sendJson(res, 200, readActivity().slice(0, limit));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/system/info') {
      sendJson(res, 200, getServerIdentity());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/users') {
      if (!requireRole(res, session, ['admin'])) return;
      sendJson(res, 200, readUsers().map(serializeUserForClient));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/users') {
      if (!requireRole(res, session, ['admin'])) return;
      try {
        const data = await parseBody(req);
        const username = String(data.username || '').trim();
        const name = String(data.name || '').trim();
        const password = String(data.password || '').trim();

        if (!username || !name) {
          sendJson(res, 400, { error: 'Username and full name are required.' });
          return;
        }

        if (password.length < 4) {
          sendJson(res, 400, { error: 'Password must be at least 4 characters long.' });
          return;
        }

        const users = readUsers();
        if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
          sendJson(res, 409, { error: 'A user with that username already exists.' });
          return;
        }

        const hashed = hashPassword(password);
        const user = normalizeUserInput(
          {
            ...data,
            username,
            name,
            role: data.role || 'viewer',
            allowedVmIds: data.allowedVmIds || [],
            password,
            failedLoginAttempts: 0,
            lockUntil: 0,
            lastLoginAt: null
          },
          {
            id: Date.now(),
            passwordHash: hashed.hash,
            passwordSalt: hashed.salt,
            allowedVmIds: [],
            failedLoginAttempts: 0,
            lockUntil: 0,
            lastLoginAt: null
          }
        );

        users.push(user);
        writeUsers(users);
        logActivity(session, 'user.create', 'user', user.id, `Created user ${user.username}.`);
        sendJson(res, 201, serializeUserForClient(user));
      } catch (error) {
        sendJson(res, 400, { error: error.message || 'Invalid user payload.' });
      }
      return;
    }

    if (req.method === 'PUT' && url.pathname.startsWith('/api/users/')) {
      if (!requireRole(res, session, ['admin'])) return;
      try {
        const id = Number(url.pathname.split('/')[3]);
        const data = await parseBody(req);
        const users = readUsers();
        const index = users.findIndex(item => item.id === id);

        if (index === -1) {
          sendJson(res, 404, { error: 'User not found.' });
          return;
        }

        const updated = normalizeUserInput(data, users[index]);
        if (!updated.username || !updated.name) {
          sendJson(res, 400, { error: 'Username and full name are required.' });
          return;
        }

        if (data.role === 'viewer' && !Array.isArray(updated.allowedVmIds)) {
          updated.allowedVmIds = [];
        }

        users[index] = updated;
        writeUsers(users);
        logActivity(session, 'user.update', 'user', updated.id, `Updated user ${updated.username}.`);
        sendJson(res, 200, serializeUserForClient(updated));
      } catch (error) {
        sendJson(res, 400, { error: error.message || 'Invalid user payload.' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/users/') && url.pathname.endsWith('/action')) {
      if (!requireRole(res, session, ['admin'])) return;
      try {
        const id = Number(url.pathname.split('/')[3]);
        const data = await parseBody(req);
        const action = String(data.action || '').toLowerCase();
        const users = readUsers();
        const index = users.findIndex(item => item.id === id);

        if (index === -1) {
          sendJson(res, 404, { error: 'User not found.' });
          return;
        }

        if (action === 'lock') {
          users[index].lockUntil = Date.now() + ACCOUNT_LOCKOUT_MS;
          users[index].failedLoginAttempts = MAX_FAILED_LOGIN_ATTEMPTS;
        } else if (action === 'unlock') {
          users[index].lockUntil = 0;
          users[index].failedLoginAttempts = 0;
        } else if (action === 'reset') {
          users[index].lockUntil = 0;
          users[index].failedLoginAttempts = 0;
        } else {
          sendJson(res, 400, { error: 'Action must be lock, unlock, or reset.' });
          return;
        }

        writeUsers(users);
        logActivity(session, `user.${action}`, 'user', users[index].id, `User ${users[index].username} ${action}ed.`);
        sendJson(res, 200, serializeUserForClient(users[index]));
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid action payload.' });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/hypervisor/config') {
      if (!requireRole(res, session, ['admin'])) return;
      const config = readHypervisorConfig();
      sendJson(res, 200, sanitizeHypervisorConfig(config));
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/api/hypervisor/config') {
      if (!requireRole(res, session, ['admin'])) return;
      try {
        const input = await parseBody(req);
        const current = readHypervisorConfig();
        const next = mergeHypervisorConfig(current, input);
        writeHypervisorConfig(next);
        resetProxmoxRuntimeState();
        logActivity(session, 'hypervisor.config_updated', 'hypervisor', next.baseUrl || 'proxmox', 'Hypervisor configuration updated.');
        sendJson(res, 200, sanitizeHypervisorConfig(next));
      } catch (error) {
        sendJson(res, 400, { error: error.message || 'Invalid hypervisor config payload.' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/hypervisor/test') {
      if (!requireRole(res, session, ['admin'])) return;
      try {
        const config = readHypervisorConfig();
        if (!config.enabled) {
          sendJson(res, 400, { error: 'Enable hypervisor integration before testing.' });
          return;
        }

        if (config.type !== 'proxmox') {
          sendJson(res, 400, { error: 'Only Proxmox testing is currently supported.' });
          return;
        }

        const scopedVms = readVms();
        const snapshot = await getProxmoxMonitorSnapshot(config, scopedVms);
        sendJson(res, 200, {
          success: true,
          source: 'proxmox',
          host: snapshot.host,
          vmCount: snapshot.vmMetrics.length
        });
      } catch (error) {
        sendJson(res, 502, { error: error.message || 'Hypervisor test failed.' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/vms/sync-from-hypervisor') {
      if (!requireRole(res, session, ['admin'])) return;
      try {
        const config = readHypervisorConfig();
        if (!config.enabled) {
          sendJson(res, 400, { error: 'Enable hypervisor integration before syncing VMs.' });
          return;
        }

        if (config.type !== 'proxmox') {
          sendJson(res, 400, { error: 'VM sync is currently supported for Proxmox only.' });
          return;
        }

        const currentVms = readVms();
        const syncedVms = await syncProxmoxVmInventory(config, currentVms);
        if (!syncedVms.length) {
          sendJson(res, 409, {
            error: 'No VMs were visible from Proxmox, so the existing inventory was left unchanged.',
            hint: 'Grant token permissions such as VM.Audit on /vms and Sys.Audit on /, then retry.'
          });
          return;
        }

        writeVms(syncedVms);
        logActivity(
          session,
          'vm.sync_from_hypervisor',
          'hypervisor',
          config.baseUrl || 'proxmox',
          `Imported ${syncedVms.length} VMs from Proxmox.`
        );
        sendJson(res, 200, {
          success: true,
          count: syncedVms.length,
          source: 'proxmox',
          vms: syncedVms
        });
      } catch (error) {
        sendJson(res, 502, { error: error.message || 'Hypervisor sync failed.' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/vms') {
      if (!requireRole(res, session, ['admin'])) return;
      try {
        const data = await parseBody(req);
        const vms = readVms();
        const vm = normalizeVmInput(
          {
            ...data,
            status: data.status || 'stopped',
            cpuCores: data.cpuCores ?? 2,
            ramGb: data.ramGb ?? 4,
            diskGb: data.diskGb ?? 40,
            owner: data.owner || 'Unassigned',
            tags: data.tags || []
          },
          {
            id: Date.now(),
            createdAt: new Date().toISOString()
          }
        );

        const error = validateVm(vm);
        if (error) {
          sendJson(res, 400, { error });
          return;
        }

        vms.push(vm);
        writeVms(vms);

        if (data.vmAccessEmail || data.vmAccessUsername || data.vmAccessPassword) {
          createVmViewerAccountForEdit(vm, {
            email: data.vmAccessEmail,
            username: data.vmAccessUsername,
            password: data.vmAccessPassword
          });
        }

        logActivity(session, 'vm.create', 'vm', vm.id, `Created VM ${vm.name}.`);
        sendJson(res, 201, vm);
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
      return;
    }

    if (req.method === 'PUT' && url.pathname.startsWith('/api/vms/')) {
      if (!requireRole(res, session, ['admin'])) return;
      try {
        const id = Number(url.pathname.split('/')[3]);
        const data = await parseBody(req);
        const vms = readVms();
        const index = vms.findIndex(item => item.id === id);
        if (index === -1) {
          sendJson(res, 404, { error: 'VM not found' });
          return;
        }

        const updated = normalizeVmInput(data, vms[index]);
        const error = validateVm(updated);
        if (error) {
          sendJson(res, 400, { error });
          return;
        }

        vms[index] = updated;
        writeVms(vms);

        if (data.vmAccessEmail || data.vmAccessUsername || data.vmAccessPassword) {
          createVmViewerAccountForEdit(updated, {
            email: data.vmAccessEmail,
            username: data.vmAccessUsername,
            password: data.vmAccessPassword
          });
        }

        logActivity(session, 'vm.update', 'vm', updated.id, `Updated VM ${updated.name}.`);
        sendJson(res, 200, updated);
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/vms/')) {
      if (!requireRole(res, session, ['admin'])) return;
      const id = Number(url.pathname.split('/')[3]);
      const vms = readVms();
      const vm = vms.find(item => item.id === id);
      const filtered = vms.filter(item => item.id !== id);

      if (filtered.length === vms.length) {
        sendJson(res, 404, { error: 'VM not found' });
        return;
      }

      writeVms(filtered);
      logActivity(session, 'vm.delete', 'vm', id, `Deleted VM ${vm ? vm.name : id}.`);
      sendJson(res, 200, { success: true });
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/vms/') && url.pathname.endsWith('/action')) {
      if (!requireRole(res, session, ['admin', 'operator'])) return;
      try {
        const id = Number(url.pathname.split('/')[3]);
        const data = await parseBody(req);
        const action = String(data.action || '').toLowerCase();
        const vms = readVms();
        const vm = vms.find(item => item.id === id);

        if (!vm) {
          sendJson(res, 404, { error: 'VM not found' });
          return;
        }

        if (!['start', 'stop', 'restart'].includes(action)) {
          sendJson(res, 400, { error: 'Action must be start, stop, or restart.' });
          return;
        }

        if (action === 'start') vm.status = 'running';
        if (action === 'stop') vm.status = 'stopped';
        if (action === 'restart') vm.status = 'running';
        vm.lastUpdatedAt = new Date().toISOString();

        writeVms(vms);
        logActivity(session, `vm.${action}`, 'vm', vm.id, `${action} action executed on VM ${vm.name}.`);
        sendJson(res, 200, vm);
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
      return;
    }

    sendJson(res, 404, { error: 'API route not found' });
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  ensureDataFiles();
  console.log(`VM manager running at http://localhost:${port}`);
  console.log('Default users: admin/admin123, operator/operator123, viewer/viewer123');
});

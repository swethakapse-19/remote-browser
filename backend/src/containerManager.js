const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let Docker;
let docker;
try {
  Docker = require('dockerode');
  const isWindows = process.platform === 'win32';
  docker = isWindows
    ? new Docker({ socketPath: '//./pipe/dockerDesktopLinuxEngine' })
    : new Docker({ socketPath: '/var/run/docker.sock' });
} catch {
  console.log('[container] dockerode not available, will use local Chrome only');
}

const IMAGE_NAME = 'remote-browser-chrome';
const CONTAINER_PREFIX = 'rb-session-';

const CHROME_PATHS_WINDOWS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files\\Chromium\\Application\\chromium.exe',
];
const CHROME_PATHS_MAC = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const CHROME_PATHS_LINUX = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

function findChromePath() {
  const paths = process.platform === 'win32' ? CHROME_PATHS_WINDOWS
    : process.platform === 'darwin' ? CHROME_PATHS_MAC
    : CHROME_PATHS_LINUX;

  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log(`[container] Found Chrome at: ${p}`);
      return p;
    }
  }
  throw new Error('Chrome/Chromium not found. Please install Chrome.');
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function isDockerAvailable() {
  if (!docker) return false;
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

async function buildImageIfNeeded(dockerfilePath) {
  try {
    await docker.getImage(IMAGE_NAME).inspect();
    console.log(`[docker] Image "${IMAGE_NAME}" already exists`);
  } catch {
    console.log(`[docker] Building image "${IMAGE_NAME}"...`);
    const stream = await docker.buildImage(
      { context: dockerfilePath, src: ['Dockerfile', 'entrypoint.sh'] },
      { t: IMAGE_NAME }
    );
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else { console.log(`[docker] Image built`); resolve(res); }
      }, (event) => {
        if (event.stream) process.stdout.write(event.stream);
      });
    });
  }
}

async function startDockerContainer() {
  const cdpPort = await getFreePort();
  const container = await docker.createContainer({
    Image: IMAGE_NAME,
    name: `${CONTAINER_PREFIX}${Date.now()}`,
    ExposedPorts: { '9222/tcp': {} },
    HostConfig: {
      PortBindings: { '9222/tcp': [{ HostIp: '127.0.0.1', HostPort: String(cdpPort) }] },
      AutoRemove: false,
      ShmSize: 268435456,
    },
  });
  await container.start();
  console.log(`[docker] Container started: ${container.id.substring(0, 12)}, CDP port: ${cdpPort}`);
  return { containerId: container.id, cdpPort, mode: 'docker' };
}

async function stopDockerContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 5 }).catch(() => {});
    await container.remove({ force: true });
    console.log(`[docker] Container removed: ${containerId.substring(0, 12)}`);
  } catch (err) {
    console.error(`[docker] Stop error: ${err.message}`);
  }
}

const chromeProcesses = new Map();

async function startLocalChrome() {
  const cdpPort = await getFreePort();
  const chromePath = findChromePath();

  const userDataDir = path.join(os.tmpdir(), `rb-chrome-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const chromeArgs = [
    `--remote-debugging-port=${cdpPort}`,
    '--remote-debugging-address=127.0.0.1',
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-ipc-flooding-protection',
    '--window-size=1280,720',
    '--force-device-scale-factor=1',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-popup-blocking',
    'about:blank',
  ];

  console.log(`[chrome] Launching local Chrome, CDP port: ${cdpPort}`);
  const proc = spawn(chromePath, chromeArgs, {
    detached: false,
    stdio: 'ignore',
  });

  proc.on('error', (err) => console.error(`[chrome] Process error: ${err.message}`));
  proc.on('exit', (code) => console.log(`[chrome] Process exited with code: ${code}`));

  const sessionKey = `local-${proc.pid}`;
  chromeProcesses.set(sessionKey, { proc, userDataDir });

  console.log(`[chrome] Launched PID: ${proc.pid}`);
  return { containerId: sessionKey, cdpPort, mode: 'local' };
}

async function stopLocalChrome(sessionKey) {
  const entry = chromeProcesses.get(sessionKey);
  if (!entry) return;
  try {
    entry.proc.kill('SIGTERM');
    setTimeout(() => {
      try { entry.proc.kill('SIGKILL'); } catch {}
    }, 2000);
    setTimeout(() => {
      try { fs.rmSync(entry.userDataDir, { recursive: true, force: true }); } catch {}
    }, 3000);
    chromeProcesses.delete(sessionKey);
    console.log(`[chrome] Process killed: ${sessionKey}`);
  } catch (err) {
    console.error(`[chrome] Stop error: ${err.message}`);
  }
}

async function startContainer(dockerfilePath) {
  if (await isDockerAvailable()) {
    console.log('[container] Mode: Docker');
    await buildImageIfNeeded(dockerfilePath);
    return await startDockerContainer();
  } else {
    console.log('[container] Mode: Local Chrome (Docker not available)');
    return await startLocalChrome();
  }
}

async function stopContainer(containerId) {
  if (containerId.startsWith('local-')) {
    await stopLocalChrome(containerId);
  } else {
    await stopDockerContainer(containerId);
  }
}

async function waitForCdpReady(cdpPort, maxWaitMs = 20000) {
  const http = require('http');
  const startTime = Date.now();
  console.log(`[container] Waiting for CDP on port ${cdpPort}...`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${cdpPort}/json/version`, (res) => {
          let data = '';
          res.on('data', d => data += d);
          res.on('end', () => {
            if (res.statusCode === 200) resolve(data);
            else reject(new Error(`HTTP ${res.statusCode}`));
          });
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      console.log(`[container] CDP ready on port ${cdpPort}`);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error(`CDP not ready on port ${cdpPort} after ${maxWaitMs}ms`);
}

async function getContainerStatus(containerId) {
  if (containerId.startsWith('local-')) {
    const entry = chromeProcesses.get(containerId);
    return {
      running: !!entry,
      status: entry ? 'running' : 'stopped',
      mode: 'local',
    };
  }
  try {
    const info = await docker.getContainer(containerId).inspect();
    return { running: info.State.Running, status: info.State.Status, mode: 'docker' };
  } catch {
    return { running: false, status: 'removed', mode: 'docker' };
  }
}

module.exports = {
  startContainer,
  stopContainer,
  waitForCdpReady,
  getContainerStatus,
  isDockerAvailable,
};

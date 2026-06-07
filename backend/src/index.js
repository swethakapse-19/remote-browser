const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const containerManager = require('./containerManager');
const cdpClient = require('./cdpClient');
const sessionManager = require('./sessionManager');

const PORT = process.env.PORT || 3001;
const DOCKER_CONTEXT = path.resolve(__dirname, '../../docker');

const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json());

app.post('/api/start', async (req, res) => {
  const sessionId = uuidv4();
  console.log(`\n[api] POST /api/start → sessionId: ${sessionId}`);

  try {
    const { containerId, cdpPort, mode } = await containerManager.startContainer(DOCKER_CONTEXT);
    console.log(`[api] Browser mode: ${mode}, CDP port: ${cdpPort}`);

    sessionManager.createSession(sessionId, containerId, cdpPort);

    await containerManager.waitForCdpReady(cdpPort);

    await cdpClient.connectAndStream(sessionId, cdpPort);

    console.log(`[api] Session ${sessionId} ready (${mode} mode)`);
    res.json({
      success: true,
      sessionId,
      mode,
      wsUrl: `ws://localhost:${PORT}/ws/${sessionId}`,
      width: 1280,
      height: 720,
    });
  } catch (err) {
    console.error(`[api] Failed to start session:`, err.message);
    const session = sessionManager.getSession(sessionId);
    if (session?.containerId) {
      await containerManager.stopContainer(session.containerId).catch(() => {});
    }
    sessionManager.deleteSession(sessionId);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/stop/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  console.log(`[api] POST /api/stop/${sessionId}`);

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  try {
    if (session.cdpClient) {
      await cdpClient.disconnect(session.cdpClient);
    }
    await containerManager.stopContainer(session.containerId);
    sessionManager.deleteSession(sessionId);
    console.log(`[api] Session ${sessionId} stopped`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[api] Failed to stop session:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  const containerStatus = await containerManager.getContainerStatus(session.containerId);
  res.json({
    success: true,
    sessionId,
    currentUrl: session.currentUrl,
    isLoading: session.isLoading,
    container: containerStatus,
    clients: session.wsClients.size,
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, sessions: sessionManager.getAllSessions().length });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const match = url.pathname.match(/^\/ws\/([a-f0-9-]+)$/i);

  if (!match) {
    socket.destroy();
    return;
  }

  const sessionId = match[1];
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, sessionId);
  });
});

wss.on('connection', (ws, request, sessionId) => {
  console.log(`[ws] Client connected to session ${sessionId}`);
  sessionManager.addWsClient(sessionId, ws);

  const session = sessionManager.getSession(sessionId);
  if (session) {
    ws.send(JSON.stringify({
      type: 'session_ready',
      sessionId,
      width: 1280,
      height: 720,
      url: session.currentUrl,
    }));
  }

  ws.on('message', async (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      return;
    }

    const s = sessionManager.getSession(sessionId);
    if (!s?.cdpClient) return;

    try {
      switch (msg.type) {
        case 'mouse':
          await cdpClient.dispatchMouseEvent(s.cdpClient, msg);
          break;
        case 'scroll':
          await cdpClient.dispatchScrollEvent(s.cdpClient, msg);
          break;
        case 'key':
          await cdpClient.dispatchKeyEvent(s.cdpClient, msg);
          break;
        case 'navigate':
          await cdpClient.navigateTo(s.cdpClient, msg.url);
          break;
        case 'go_back':
          await cdpClient.goBack(s.cdpClient);
          break;
        case 'go_forward':
          await cdpClient.goForward(s.cdpClient);
          break;
        case 'reload':
          await cdpClient.reload(s.cdpClient);
          break;
        default:
          console.warn(`[ws] Unknown message type: ${msg.type}`);
      }
    } catch (err) {
      console.error(`[ws] Error handling ${msg.type}:`, err.message);
    }
  });

  ws.on('close', () => {
    console.log(`[ws] Client disconnected from session ${sessionId}`);
    sessionManager.removeWsClient(sessionId, ws);
  });

  ws.on('error', (err) => {
    console.error(`[ws] Error:`, err.message);
    sessionManager.removeWsClient(sessionId, ws);
  });
});

server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   Remote Browser Backend               ║`);
  console.log(`║   REST API:  http://localhost:${PORT}    ║`);
  console.log(`║   WebSocket: ws://localhost:${PORT}/ws/  ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
});

async function shutdown() {
  console.log('\n[server] Shutting down, cleaning up sessions...');
  for (const session of sessionManager.getAllSessions()) {
    if (session.cdpClient) await cdpClient.disconnect(session.cdpClient).catch(() => {});
    await containerManager.stopContainer(session.containerId).catch(() => {});
    sessionManager.deleteSession(session.id);
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const sessions = new Map();

function createSession(id, containerId, cdpPort) {
  const session = {
    id,
    containerId,
    cdpPort,
    cdpClient: null,
    currentUrl: 'about:blank',
    isLoading: false,
    createdAt: new Date(),
    wsClients: new Set(),
  };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

function deleteSession(id) {
  sessions.delete(id);
}

function getAllSessions() {
  return Array.from(sessions.values());
}

function addWsClient(sessionId, ws) {
  const session = sessions.get(sessionId);
  if (session) session.wsClients.add(ws);
}

function removeWsClient(sessionId, ws) {
  const session = sessions.get(sessionId);
  if (session) session.wsClients.delete(ws);
}

function broadcast(sessionId, message) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const payload = JSON.stringify(message);
  for (const ws of session.wsClients) {
    if (ws.readyState === 1) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error('[session] Failed to send to client:', err.message);
      }
    }
  }
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  getAllSessions,
  addWsClient,
  removeWsClient,
  broadcast,
};

const CDP = require('chrome-remote-interface');
const sessionManager = require('./sessionManager');

const SCREENCAST_CONFIG = {
  format: 'jpeg',
  quality: 80,
  maxWidth: 1280,
  maxHeight: 720,
  everyNthFrame: 1,
};

async function connectAndStream(sessionId, cdpPort) {
  console.log(`[cdp] Connecting to CDP on port ${cdpPort} for session ${sessionId}`);

  let client;
  try {
    client = await CDP({ host: '127.0.0.1', port: cdpPort });
  } catch (err) {
    throw new Error(`Failed to connect to CDP: ${err.message}`);
  }

  const { Page, Input, Runtime, Network, Target } = client;

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    await client.close();
    throw new Error(`Session ${sessionId} not found`);
  }
  session.cdpClient = client;

  await Page.enable();
  await Network.enable();

  Page.loadEventFired(() => {
    session.isLoading = false;
    sessionManager.broadcast(sessionId, { type: 'load_stop' });
  });

  Page.frameNavigated(async ({ frame }) => {
    if (!frame.parentId) {
      session.currentUrl = frame.url;
      sessionManager.broadcast(sessionId, { type: 'url_change', url: frame.url });
    }
  });

  Page.frameStartedLoading(() => {
    session.isLoading = true;
    sessionManager.broadcast(sessionId, { type: 'load_start' });
  });

  client.on('disconnect', () => {
    console.log(`[cdp] Disconnected for session ${sessionId}`);
    sessionManager.broadcast(sessionId, { type: 'error', message: 'Browser disconnected' });
    if (session.screenshotInterval) {
      clearInterval(session.screenshotInterval);
      session.screenshotInterval = null;
    }
  });

  let lastFrameTime = Date.now();

  await Page.startScreencast(SCREENCAST_CONFIG);
  console.log(`[cdp] Screencast started for session ${sessionId}`);

  Page.screencastFrame(async ({ data, sessionId: frameSessionId, metadata }) => {
    try {
      await Page.screencastFrameAck({ sessionId: frameSessionId });
    } catch { }

    lastFrameTime = Date.now();
    sessionManager.broadcast(sessionId, {
      type: 'frame',
      data,
      width: metadata?.deviceWidth || 1280,
      height: metadata?.deviceHeight || 720,
    });
  });

  session.screenshotInterval = setInterval(async () => {
    if (!sessionManager.getSession(sessionId)) {
      clearInterval(session.screenshotInterval);
      return;
    }
    if (Date.now() - lastFrameTime > 300 && session.wsClients.size > 0) {
      try {
        const result = await client.Page.captureScreenshot({ format: 'jpeg', quality: 75 });
        lastFrameTime = Date.now();
        sessionManager.broadcast(sessionId, {
          type: 'frame',
          data: result.data,
          width: 1280,
          height: 720,
        });
      } catch { }
    }
  }, 200);

  return client;
}

async function dispatchMouseEvent(cdpClient, { eventType, x, y, button = 1, clickCount = 1, deltaX = 0, deltaY = 0 }) {
  const buttonMap = { 0: 'none', 1: 'left', 2: 'middle', 3: 'right' };
  try {
    await cdpClient.Input.dispatchMouseEvent({
      type: eventType,
      x: Math.round(x),
      y: Math.round(y),
      button: buttonMap[button] || 'none',
      clickCount,
      deltaX,
      deltaY,
    });
  } catch (err) { }
}

async function dispatchScrollEvent(cdpClient, { x, y, deltaX, deltaY }) {
  try {
    await cdpClient.Input.dispatchMouseEvent({
      type: 'mouseWheel',
      x: Math.round(x),
      y: Math.round(y),
      deltaX,
      deltaY,
    });
  } catch { }
}

async function dispatchKeyEvent(cdpClient, { eventType, key, code, modifiers = 0, text }) {
  try {
    await cdpClient.Input.dispatchKeyEvent({
      type: eventType,
      key,
      code,
      modifiers,
      text: text || (eventType === 'char' ? key : ''),
      windowsVirtualKeyCode: getVirtualKeyCode(key),
      nativeVirtualKeyCode: getVirtualKeyCode(key),
    });
  } catch { }
}

async function navigateTo(cdpClient, url) {
  if (!url || !url.trim() || url.trim() === 'https://' || url.trim() === 'http://') {
    throw new Error('Cannot navigate to empty or invalid URL');
  }
  const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  if (fullUrl === 'https://' || fullUrl === 'http://') {
    throw new Error('Cannot navigate to empty URL');
  }
  try {
    await cdpClient.Page.navigate({ url: fullUrl });
    return fullUrl;
  } catch (err) {
    throw new Error(`Navigation failed: ${err.message}`);
  }
}

async function goBack(cdpClient) {
  try {
    const { currentIndex, entries } = await cdpClient.Page.getNavigationHistory();
    if (currentIndex > 0) {
      await cdpClient.Page.navigateToHistoryEntry({ entryId: entries[currentIndex - 1].id });
    }
  } catch { }
}

async function goForward(cdpClient) {
  try {
    const { currentIndex, entries } = await cdpClient.Page.getNavigationHistory();
    if (currentIndex < entries.length - 1) {
      await cdpClient.Page.navigateToHistoryEntry({ entryId: entries[currentIndex + 1].id });
    }
  } catch { }
}

async function reload(cdpClient) {
  try {
    await cdpClient.Page.reload({ ignoreCache: false });
  } catch { }
}

async function disconnect(cdpClient) {
  try {
    await cdpClient.Page.stopScreencast();
  } catch { }
  try {
    await cdpClient.close();
  } catch { }
}

function getVirtualKeyCode(key) {
  const map = {
    'Backspace': 8, 'Tab': 9, 'Enter': 13, 'Shift': 16, 'Control': 17,
    'Alt': 18, 'Escape': 27, 'Space': 32, ' ': 32,
    'PageUp': 33, 'PageDown': 34, 'End': 35, 'Home': 36,
    'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowRight': 39, 'ArrowDown': 40,
    'Delete': 46, 'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115,
    'F5': 116, 'F6': 117, 'F7': 118, 'F8': 119, 'F9': 120,
    'F10': 121, 'F11': 122, 'F12': 123,
  };
  return map[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
}

module.exports = {
  connectAndStream,
  dispatchMouseEvent,
  dispatchScrollEvent,
  dispatchKeyEvent,
  navigateTo,
  goBack,
  goForward,
  reload,
  disconnect,
};

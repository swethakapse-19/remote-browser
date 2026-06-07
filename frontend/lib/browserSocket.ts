export type ServerMessage =
  | { type: 'frame'; data: string; width: number; height: number }
  | { type: 'url_change'; url: string }
  | { type: 'load_start' }
  | { type: 'load_stop' }
  | { type: 'error'; message: string }
  | { type: 'session_ready'; sessionId: string; width: number; height: number; url: string };

export type ClientMessage =
  | { type: 'mouse'; eventType: 'mousePressed' | 'mouseReleased' | 'mouseMoved'; x: number; y: number; button: number; clickCount?: number }
  | { type: 'scroll'; deltaX: number; deltaY: number; x: number; y: number }
  | { type: 'key'; eventType: 'keyDown' | 'keyUp' | 'char'; key: string; code: string; modifiers?: number; text?: string }
  | { type: 'navigate'; url: string }
  | { type: 'go_back' }
  | { type: 'go_forward' }
  | { type: 'reload' };

export interface BrowserSocketOptions {
  sessionId: string;
  onMessage: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
}

export class BrowserSocket {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private onMessage: (msg: ServerMessage) => void;
  private onOpen?: () => void;
  private onClose?: () => void;
  private onError?: (err: Event) => void;
  private closed = false;

  private frameCount = 0;
  private lastFpsCheck = Date.now();
  public fps = 0;

  constructor(options: BrowserSocketOptions) {
    this.sessionId = options.sessionId;
    this.onMessage = options.onMessage;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onError = options.onError;
  }

  connect(): void {
    if (this.ws) return;
    const url = `ws://localhost:3001/ws/${this.sessionId}`;
    console.log(`[ws] Connecting to ${url}`);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[ws] Connected');
      this.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === 'frame') {
          this.frameCount++;
          const now = Date.now();
          if (now - this.lastFpsCheck >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsCheck = now;
          }
        }
        this.onMessage(msg);
      } catch (err) {
        console.error('[ws] Failed to parse message:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('[ws] Disconnected');
      this.ws = null;
      if (!this.closed) this.onClose?.();
    };

    this.ws.onerror = (err) => {
      console.error('[ws] Error:', err);
      this.onError?.(err);
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

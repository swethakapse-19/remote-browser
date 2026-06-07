'use client';

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { BrowserSocket } from '@/lib/browserSocket';
import type { ServerMessage } from '@/lib/browserSocket';

interface BrowserCanvasProps {
  sessionId: string | null;
  isActive: boolean;
  onUrlChange: (url: string) => void;
  onLoadStart: () => void;
  onLoadStop: () => void;
  onFpsUpdate: (fps: number) => void;
  onError: (msg: string) => void;
  socketRef: React.MutableRefObject<BrowserSocket | null>;
}

export interface BrowserCanvasHandle {
  navigate: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
}

const BrowserCanvas = forwardRef<BrowserCanvasHandle, BrowserCanvasProps>(
  ({ sessionId, isActive, onUrlChange, onLoadStart, onLoadStop, onFpsUpdate, onError, socketRef }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const pendingFrameRef = useRef<string | null>(null);
    const canvasWidthRef = useRef(1280);
    const canvasHeightRef = useRef(720);
    const fpsIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useImperativeHandle(ref, () => ({
      navigate: (url: string) => socketRef.current?.send({ type: 'navigate', url }),
      goBack: () => socketRef.current?.send({ type: 'go_back' }),
      goForward: () => socketRef.current?.send({ type: 'go_forward' }),
      reload: () => socketRef.current?.send({ type: 'reload' }),
    }));

    const renderLoop = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const frame = pendingFrameRef.current;
      if (frame) {
        pendingFrameRef.current = null;
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = `data:image/jpeg;base64,${frame}`;
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    }, []);

    useEffect(() => {
      if (isActive && canvasRef.current) {
        canvasRef.current.focus();
      }
    }, [isActive]);

    useEffect(() => {
      if (!sessionId || !isActive) return;

      const socket = new BrowserSocket({
        sessionId,
        onMessage: (msg: ServerMessage) => {
          switch (msg.type) {
            case 'frame':
              pendingFrameRef.current = msg.data;
              if (msg.width !== canvasWidthRef.current || msg.height !== canvasHeightRef.current) {
                canvasWidthRef.current = msg.width;
                canvasHeightRef.current = msg.height;
                if (canvasRef.current) {
                  canvasRef.current.width = msg.width;
                  canvasRef.current.height = msg.height;
                }
              }
              break;
            case 'url_change':
              onUrlChange(msg.url);
              break;
            case 'load_start':
              onLoadStart();
              break;
            case 'load_stop':
              onLoadStop();
              break;
            case 'error':
              onError(msg.message);
              break;
          }
        },
      });

      socketRef.current = socket;
      socket.connect();

      animFrameRef.current = requestAnimationFrame(renderLoop);

      fpsIntervalRef.current = setInterval(() => {
        onFpsUpdate(socket.fps);
      }, 1000);

      return () => {
        socket.disconnect();
        socketRef.current = null;
        cancelAnimationFrame(animFrameRef.current);
        if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current);
      };
    }, [sessionId, isActive, renderLoop, onUrlChange, onLoadStart, onLoadStop, onFpsUpdate, onError, socketRef]);

    const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e);
      socketRef.current?.send({ type: 'mouse', eventType: 'mouseMoved', x, y, button: 0 });
    }, [getCanvasCoords, socketRef]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      canvasRef.current?.focus();
      const { x, y } = getCanvasCoords(e);
      socketRef.current?.send({ type: 'mouse', eventType: 'mousePressed', x, y, button: e.button === 2 ? 3 : 1, clickCount: 1 });
    }, [getCanvasCoords, socketRef]);

    const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e);
      socketRef.current?.send({ type: 'mouse', eventType: 'mouseReleased', x, y, button: e.button === 2 ? 3 : 1, clickCount: 1 });
    }, [getCanvasCoords, socketRef]);

    const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const { x, y } = getCanvasCoords(e as unknown as React.MouseEvent<HTMLCanvasElement>);
      socketRef.current?.send({ type: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY, x, y });
    }, [getCanvasCoords, socketRef]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const modifiers = (e.shiftKey ? 8 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 1 : 0) | (e.metaKey ? 4 : 0);
      socketRef.current?.send({
        type: 'key', eventType: 'keyDown',
        key: e.key, code: e.code, modifiers,
        text: e.key.length === 1 ? e.key : undefined,
      });
      if (e.key.length === 1) {
        socketRef.current?.send({ type: 'key', eventType: 'char', key: e.key, code: e.code, modifiers, text: e.key });
      }
    }, [socketRef]);

    const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
      const modifiers = (e.shiftKey ? 8 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 1 : 0) | (e.metaKey ? 4 : 0);
      socketRef.current?.send({ type: 'key', eventType: 'keyUp', key: e.key, code: e.code, modifiers });
    }, [socketRef]);

    return (
      <canvas
        ref={canvasRef}
        id="browser-canvas"
        className="browser-canvas"
        width={canvasWidthRef.current}
        height={canvasHeightRef.current}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          display: isActive ? 'block' : 'none',
        }}
        tabIndex={0}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      />
    );
  }
);

BrowserCanvas.displayName = 'BrowserCanvas';
export default BrowserCanvas;

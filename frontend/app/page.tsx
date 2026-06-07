'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Toolbar from '@/components/Toolbar';
import StatusBar from '@/components/StatusBar';
import type { BrowserCanvasHandle } from '@/components/BrowserCanvas';
import type { BrowserSocket } from '@/lib/browserSocket';

const BrowserCanvas = dynamic(() => import('@/components/BrowserCanvas'), { ssr: false });

type AppStatus = 'idle' | 'starting' | 'active' | 'stopping';

interface LoadingStep {
  id: string;
  label: string;
  state: 'pending' | 'active' | 'done';
}

const DOCKER_STEPS: LoadingStep[] = [
  { id: 'image',     label: 'Building Docker image',       state: 'pending' },
  { id: 'container', label: 'Starting Chromium container', state: 'pending' },
  { id: 'cdp',       label: 'Connecting to Chrome CDP',    state: 'pending' },
  { id: 'stream',    label: 'Initializing screen stream',  state: 'pending' },
];

const LOCAL_STEPS: LoadingStep[] = [
  { id: 'image',     label: 'Locating Chrome installation', state: 'pending' },
  { id: 'container', label: 'Launching headless Chrome',    state: 'pending' },
  { id: 'cdp',       label: 'Connecting to Chrome CDP',     state: 'pending' },
  { id: 'stream',    label: 'Initializing screen stream',   state: 'pending' },
];

const INITIAL_STEPS = LOCAL_STEPS;

export default function HomePage() {
  const [status, setStatus]         = useState<AppStatus>('idle');
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState('about:blank');
  const [isLoading, setIsLoading]   = useState(false);
  const [fps, setFps]               = useState(0);
  const [toast, setToast]           = useState<{ msg: string; type?: 'error' } | null>(null);
  const [loadSteps, setLoadSteps]   = useState<LoadingStep[]>(INITIAL_STEPS);

  const canvasRef  = useRef<BrowserCanvasHandle>(null);
  const socketRef  = useRef<BrowserSocket | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string, type?: 'error') => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const handleLoadStart = useCallback(() => setIsLoading(true), []);
  const handleLoadStop = useCallback(() => setIsLoading(false), []);
  const handleError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  const advanceStep = useCallback((stepId: string) => {
    setLoadSteps(prev => prev.map((s, i, arr) => {
      if (s.id === stepId) return { ...s, state: 'active' };
      const idx = arr.findIndex(x => x.id === stepId);
      if (i < idx) return { ...s, state: 'done' };
      return s;
    }));
  }, []);

  const completeSteps = useCallback(() => {
    setLoadSteps(prev => prev.map(s => ({ ...s, state: 'done' })));
  }, []);

  const resetSteps = useCallback(() => {
    setLoadSteps(INITIAL_STEPS.map(s => ({ ...s, state: 'pending' })));
  }, []);

  const handleStart = useCallback(async () => {
    setStatus('starting');
    resetSteps();

    try {
      advanceStep('image');

      const res = await fetch('http://localhost:3001/api/start', { method: 'POST' });
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Failed to start session');

      if (data.mode === 'docker') {
        setLoadSteps(DOCKER_STEPS.map(s => ({ ...s, state: 'done' as const })));
      } else {
        setLoadSteps(LOCAL_STEPS.map(s => ({ ...s, state: 'done' as const })));
      }

      advanceStep('cdp');
      await new Promise(r => setTimeout(r, 200));
      advanceStep('stream');
      await new Promise(r => setTimeout(r, 200));
      completeSteps();

      setSessionId(data.sessionId);
      setCurrentUrl('about:blank');
      setStatus('active');
      const modeLabel = data.mode === 'docker' ? 'Docker container' : 'local Chrome';
      showToast(`Browser started (${modeLabel})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[app] Start failed:', msg);
      showToast(`Failed to start: ${msg}`, 'error');
      setStatus('idle');
      resetSteps();
    }
  }, [advanceStep, completeSteps, resetSteps, showToast]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    setStatus('stopping');
    setFps(0);

    try {
      await fetch(`http://localhost:3001/api/stop/${sessionId}`, { method: 'POST' });
    } catch { }

    setSessionId(null);
    setCurrentUrl('about:blank');
    setStatus('idle');
    showToast('Browser session stopped');
  }, [sessionId, showToast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (status !== 'active') return;
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); canvasRef.current?.goBack(); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); canvasRef.current?.goForward(); }
      if (e.key === 'F5') { e.preventDefault(); canvasRef.current?.reload(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status]);

  return (
    <main className="app-shell">
      <header className="app-header" role="banner">
        <div className="app-logo">
          <div className="app-logo-icon" aria-hidden>🌐</div>
          <span className="app-logo-text">RemoteBrowser</span>
        </div>

        <nav className="toolbar" role="toolbar" aria-label="Browser controls">
          <Toolbar
            status={status}
            currentUrl={currentUrl}
            isLoading={isLoading}
            onStart={handleStart}
            onStop={handleStop}
            onNavigate={(url) => canvasRef.current?.navigate(url)}
            onBack={() => canvasRef.current?.goBack()}
            onForward={() => canvasRef.current?.goForward()}
            onReload={() => canvasRef.current?.reload()}
          />
        </nav>
      </header>

      <div className="canvas-wrapper">
        {status === 'idle' && (
          <div className="idle-screen" role="main">
            <div className="idle-illustration" aria-hidden>🖥️</div>
            <h1 className="idle-title">Remote Browser Control</h1>
            <p className="idle-subtitle">
              Spin up a headless Chromium browser in Docker and control it
              in real time — click, scroll, type, and navigate from here.
            </p>
            <div className="idle-features">
              {[
                { icon: '🖱️', label: 'Mouse Control' },
                { icon: '⌨️', label: 'Keyboard Input' },
                { icon: '📜', label: 'Scroll Support' },
                { icon: '🔗', label: 'Full Navigation' },
                { icon: '🐳', label: 'Docker Isolated' },
                { icon: '⚡', label: 'Real-time CDP' },
              ].map(f => (
                <span key={f.label} className="idle-feature">
                  <span aria-hidden>{f.icon}</span>
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {status === 'starting' && (
          <div className="loading-screen" role="status" aria-label="Starting browser session">
            <div className="loading-ring" aria-hidden />
            <p className="loading-text">Spinning up your browser…</p>
            <div className="loading-steps">
              {loadSteps.map(step => (
                <div key={step.id} className={`loading-step ${step.state === 'active' ? 'active' : step.state === 'done' ? 'done' : ''}`}>
                  <span className="step-icon" aria-hidden>
                    {step.state === 'done' ? '✓' : step.state === 'active' ? '⟳' : '○'}
                  </span>
                  {step.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {status === 'stopping' && (
          <div className="loading-screen" role="status">
            <div className="loading-ring" aria-hidden />
            <p className="loading-text">Stopping session…</p>
          </div>
        )}

        <div
          className="canvas-container"
          style={{ display: status === 'active' ? 'flex' : 'none' }}
        >
          <div className="mock-browser-window">
            <div className="mock-browser-titlebar">
              <div className="mock-window-controls">
                <span className="control-dot close" />
                <span className="control-dot minimize" />
                <span className="control-dot maximize" />
              </div>
              <div className="mock-browser-tab">
                <span className="tab-icon">🌐</span>
                <span className="tab-title">
                  {currentUrl === 'about:blank' ? 'New Tab' : currentUrl.replace(/^https?:\/\/(www\.)?/, '')}
                </span>
              </div>
            </div>
            <div className="mock-browser-content">
              <BrowserCanvas
                ref={canvasRef}
                sessionId={sessionId}
                isActive={status === 'active'}
                onUrlChange={setCurrentUrl}
                onLoadStart={handleLoadStart}
                onLoadStop={handleLoadStop}
                onFpsUpdate={setFps}
                onError={handleError}
                socketRef={socketRef}
              />
            </div>
          </div>
          {status === 'active' && (
            <div className="canvas-overlay" aria-hidden>
              <div className="canvas-scanline" />
            </div>
          )}
        </div>
      </div>

      <StatusBar
        status={status}
        fps={fps}
        currentUrl={currentUrl}
        sessionId={sessionId}
      />

      <div
        className={`toast ${toast ? 'visible' : ''} ${toast?.type === 'error' ? 'error' : ''}`}
        role="alert"
        aria-live="assertive"
      >
        {toast?.msg}
      </div>
    </main>
  );
}

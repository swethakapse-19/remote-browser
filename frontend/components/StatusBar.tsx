'use client';

interface StatusBarProps {
  status: 'idle' | 'starting' | 'active' | 'stopping';
  fps: number;
  currentUrl: string;
  sessionId: string | null;
}

const statusConfig = {
  idle: { label: 'Idle', dotClass: 'status-dot-idle' },
  starting: { label: 'Connecting…', dotClass: 'status-dot-connecting' },
  active: { label: 'Connected', dotClass: 'status-dot-connected' },
  stopping: { label: 'Stopping…', dotClass: 'status-dot-connecting' },
};

export default function StatusBar({ status, fps, currentUrl, sessionId }: StatusBarProps) {
  const { label, dotClass } = statusConfig[status];

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span className="status-item">
        <span className={`status-dot ${dotClass}`} aria-hidden />
        <span>{label}</span>
      </span>

      {status === 'active' && (
        <>
          <span className="status-sep">·</span>

          <span className="status-item" title="Frames per second">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span style={{ color: fps >= 20 ? 'var(--color-success)' : fps >= 10 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
              {fps} fps
            </span>
          </span>

          <span className="status-sep">·</span>

          <span className="status-item" title="Stream resolution">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>1280 × 720</span>
          </span>

          <span className="status-sep">·</span>

          {sessionId && (
            <span className="status-item" title={`Session: ${sessionId}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              <span>Session {sessionId.slice(0, 8)}</span>
            </span>
          )}

          <span className="status-sep">·</span>

          <span
            className="status-item"
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}
            title={currentUrl}
          >
            {currentUrl || 'about:blank'}
          </span>
        </>
      )}

      <span style={{ marginLeft: 'auto', color: 'var(--color-text-subtle)' }}>
        CDP · WebSocket · Chromium
      </span>
    </div>
  );
}

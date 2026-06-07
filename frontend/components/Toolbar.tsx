'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';

interface ToolbarProps {
  status: 'idle' | 'starting' | 'active' | 'stopping';
  currentUrl: string;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
}

export default function Toolbar({
  status, currentUrl, isLoading,
  onStart, onStop, onNavigate, onBack, onForward, onReload,
}: ToolbarProps) {
  const [urlInput, setUrlInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isActive = status === 'active';

  const handleUrlKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const url = urlInput.trim();
      if (url) onNavigate(url);
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') inputRef.current?.blur();
  }, [urlInput, onNavigate]);

  const displayUrl = urlInput !== '' ? urlInput : (isActive ? currentUrl : '');

  return (
    <>
      <button
        id="btn-back"
        className="toolbar-btn"
        title="Go Back (Alt+Left)"
        disabled={!isActive}
        onClick={onBack}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
      </button>

      <button
        id="btn-forward"
        className="toolbar-btn"
        title="Go Forward (Alt+Right)"
        disabled={!isActive}
        onClick={onForward}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>

      <button
        id="btn-reload"
        className="toolbar-btn"
        title="Reload (F5)"
        disabled={!isActive}
        onClick={onReload}
        style={{ transform: isLoading ? 'rotate(360deg)' : undefined, transition: 'transform 0.5s' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
        </svg>
      </button>

      <div className="url-bar-wrap">
        <span className="url-bar-icon">
          {isLoading ? (
            <span className="spinner-sm" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          )}
        </span>
        <input
          ref={inputRef}
          id="url-bar"
          className="url-bar"
          type="text"
          placeholder={isActive ? 'Enter URL or search…' : 'Start a browser session to navigate'}
          value={displayUrl}
          onChange={(e) => setUrlInput(e.target.value)}
          onFocus={() => setUrlInput(currentUrl)}
          onBlur={() => setUrlInput('')}
          onKeyDown={handleUrlKeyDown}
          disabled={!isActive}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {status === 'idle' || status === 'active' ? (
        status === 'idle' ? (
          <button
            id="btn-start"
            className="session-btn session-btn-start"
            onClick={onStart}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Start Browser
          </button>
        ) : (
          <button
            id="btn-stop"
            className="session-btn session-btn-stop"
            onClick={onStop}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            Stop
          </button>
        )
      ) : (
        <button className="session-btn session-btn-start" disabled>
          <span className="spinner-sm" />
          {status === 'starting' ? 'Starting…' : 'Stopping…'}
        </button>
      )}
    </>
  );
}

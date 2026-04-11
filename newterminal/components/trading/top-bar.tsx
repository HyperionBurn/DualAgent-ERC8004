'use client';

import { useState, useEffect } from 'react';
import { Activity, Settings, Clock, Zap } from 'lucide-react';
import type { ConnectionStatus } from '@/lib/trading-types';

interface TopBarProps {
  agentId: string;
  connectionStatus: ConnectionStatus;
  latency?: number;
  isDemo?: boolean;
}

export function TopBar({ agentId, connectionStatus, latency, isDemo }: TopBarProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const statusColors = {
    connected: 'bg-success',
    degraded: 'bg-warning',
    disconnected: 'bg-destructive',
  };

  const statusGlow = {
    connected: 'shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    degraded: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    disconnected: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]',
  };

  return (
    <header className="h-14 glass-panel border-b border-border/50 px-4 flex items-center justify-between sticky top-0 z-50">
      {/* Left: Logo & Agent */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Zap className="w-6 h-6 text-primary" />
            <div className="absolute inset-0 blur-md bg-primary/30" />
          </div>
          <span className="font-semibold text-lg tracking-tight">FluxAgent</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Agent:</span>
          <code className="font-mono text-sm bg-secondary/50 px-2 py-0.5 rounded">
            {agentId}
          </code>
          {isDemo && (
            <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-warning/20 text-warning border-warning/30">
              DEMO
            </span>
          )}
        </div>
      </div>

      {/* Center: Connection Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${statusColors[connectionStatus]} ${statusGlow[connectionStatus]} ${connectionStatus === 'connected' ? 'pulse-live' : ''}`}
          />
          <span className="text-sm capitalize text-muted-foreground">
            {connectionStatus}
          </span>
        </div>
        {latency !== undefined && (
          <>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <span className={`font-mono text-xs ${latency > 500 ? 'text-warning' : 'text-muted-foreground'}`}>
                {latency}ms
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right: Time & Settings */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <time className="font-mono text-sm tabular-nums">
            {currentTime.toLocaleTimeString('en-US', { hour12: false })}
          </time>
        </div>
        <button className="p-2 hover:bg-secondary/50 rounded-lg transition-colors">
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}

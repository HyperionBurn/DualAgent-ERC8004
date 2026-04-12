'use client';

import { useState, useEffect } from 'react';
import { Activity, Clock, Zap, Bell } from 'lucide-react';
import type { ConnectionStatus } from '@/lib/trading-types';

interface TopBarProps {
  agentId: string;
  connectionStatus: ConnectionStatus;
  latency?: number;
  isDemo?: boolean;
  unreadNotificationCount?: number;
  onBellClick?: () => void;
  uptime?: string;
  checkpointCount?: number;
  tradeCount?: number;
}

export function TopBar({
  agentId,
  connectionStatus,
  latency,
  isDemo,
  unreadNotificationCount = 0,
  onBellClick,
  uptime,
  checkpointCount,
  tradeCount,
}: TopBarProps) {
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

      {/* Right: Bell + Live Badge + Time */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBellClick}
          className="relative p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary/50"
          title="Trade notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadNotificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] leading-4 text-primary-foreground text-center font-mono font-semibold animate-pulse">
              {unreadNotificationCount}
            </span>
          )}
        </button>
        {connectionStatus === 'connected' && uptime && checkpointCount !== undefined && tradeCount !== undefined && (
          <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-full border border-success/30 bg-success/10 text-success text-xs font-mono whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-success pulse-live" />
            <span>Live {uptime}</span>
            <span className="text-success/60">·</span>
            <span>{checkpointCount} ticks</span>
            <span className="text-success/60">·</span>
            <span>{tradeCount} trades</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <time className="font-mono text-sm tabular-nums">
            {currentTime.toLocaleTimeString('en-US', { hour12: false })}
          </time>
        </div>
      </div>
    </header>
  );
}

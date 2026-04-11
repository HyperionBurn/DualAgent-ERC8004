'use client';

import { Clock, Database, Activity, GitBranch, TrendingDown } from 'lucide-react';
import type { DashboardStatus } from '@/lib/trading-types';

interface FooterProps {
  status: DashboardStatus;
  lastUpdated?: Date;
  drawdownBps?: number;
  maxDrawdownBps?: number;
}

function formatUsd(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function Footer({ status, lastUpdated, drawdownBps, maxDrawdownBps }: FooterProps) {
  const repCtx = status.reputationContext;
  const latestFailure = repCtx?.latestFailureContext;

  return (
    <footer className="glass-panel border-t border-border/50 px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5" />
          <span className="font-mono">{status.agentId}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" />
          <span>{status.marketMode ?? status.mode ?? 'N/A'} feed</span>
        </div>
        {drawdownBps !== undefined && (
          <>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" />
              <span className={drawdownBps > 500 ? 'text-warning' : ''}>
                DD: {drawdownBps} bps{maxDrawdownBps ? ` / ${maxDrawdownBps} bps limit` : ''}
              </span>
            </div>
          </>
        )}
        {latestFailure?.deltaNetPnlUsd != null && (
          <>
            <div className="h-3 w-px bg-border" />
            <span className="text-destructive">
              Last failure: {formatUsd(latestFailure.deltaNetPnlUsd)}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        {repCtx && (
          <>
            <span>{repCtx.feedbackCount} feedbacks · {repCtx.failureContextCount} failures</span>
            <div className="h-3 w-px bg-border" />
          </>
        )}
        <div className="flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5" />
          <span>v1.0.0</span>
        </div>
        {lastUpdated && (
          <>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-mono">
                Updated {lastUpdated.toLocaleTimeString('en-US', { hour12: false })}
              </span>
            </div>
          </>
        )}
      </div>
    </footer>
  );
}

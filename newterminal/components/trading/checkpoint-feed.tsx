'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { EtherscanLink } from './etherscan-link';
import type { DashboardCheckpoint } from '@/lib/trading-types';

interface CheckpointFeedProps {
  checkpoints: DashboardCheckpoint[];
}

export function CheckpointFeed({ checkpoints }: CheckpointFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL');

  const filteredCheckpoints = checkpoints
    .filter(cp => filter === 'ALL' || cp.action === filter)
    .slice(0, 5);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  };

  const actionColors: Record<string, string> = {
    BUY: 'text-success',
    SELL: 'text-destructive',
    HOLD: 'text-warning',
  };

  const actionBg: Record<string, string> = {
    BUY: 'bg-success/10 border-l-success',
    SELL: 'bg-destructive/10 border-l-destructive',
    HOLD: 'bg-warning/10 border-l-warning',
  };

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
            Trade Log
          </h3>
        </div>
        
        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-xs font-mono rounded transition-colors ${
                filter === f
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
        {filteredCheckpoints.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No checkpoints to display
          </div>
        ) : (
          filteredCheckpoints.map((cp, index) => {
            const key = cp.checkpointHash ?? cp.intentHash ?? `${cp.timestamp}-${index}`;
            const isExpanded = expandedId === key;
            
            return (
              <div
                key={key}
                className={`animate-slide-in border-l-2 ${actionBg[cp.action]} rounded-r-lg transition-all duration-200`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : cp.intentHash)}
                  className="w-full text-left p-3 hover:bg-white/5 transition-colors"
                >
                  {/* Main line - terminal style */}
                  <div className="flex items-start gap-2 font-mono text-sm">
                    <span className="text-muted-foreground flex-shrink-0">
                      [{formatTime(cp.timestamp)}]
                    </span>
                    <span className={`font-semibold flex-shrink-0 ${actionColors[cp.action]}`}>
                      {cp.action.padEnd(4)}
                    </span>
                    <span className="text-foreground flex-shrink-0">{cp.pair}</span>
                    <span className="text-muted-foreground">@</span>
                    <span className="text-foreground">
                      ${cp.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">conf:</span>
                    <span className={cp.confidence >= 0.8 ? 'text-success' : cp.confidence >= 0.6 ? 'text-warning' : 'text-muted-foreground'}>
                      {(cp.confidence * 100).toFixed(0)}%
                    </span>
                    {cp.amountUsd > 0 && (
                      <>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-foreground">
                          ${cp.amountUsd.toLocaleString()}
                        </span>
                      </>
                    )}
                    <span className="ml-auto">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border/30">
                    <div className="pt-2">
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-primary font-mono">{">"}</span>
                        <p className="text-muted-foreground leading-relaxed">
                          {cp.reasoning}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                      <span>Model: {cp.model ?? 'N/A'}</span>
                      <span>Hash: <EtherscanLink hash={cp.intentHash} /></span>
                      {cp.checkpointHash && (
                        <span>Checkpoint: <EtherscanLink hash={cp.checkpointHash} /></span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

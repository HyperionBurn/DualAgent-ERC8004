'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, AlertTriangle, Sparkles } from 'lucide-react';
import type { DashboardTrace } from '@/lib/trading-types';

interface TraceFeedProps {
  traces: DashboardTrace[];
}

export function TraceFeed({ traces }: TraceFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  };

  const getModelIcon = (model: string) => {
    if (model.includes('gpt')) return { bg: 'bg-success/20', text: 'text-success', label: 'GPT' };
    if (model.includes('claude')) return { bg: 'bg-warning/20', text: 'text-warning', label: 'Claude' };
    return { bg: 'bg-primary/20', text: 'text-primary', label: 'AI' };
  };

  const actionColors: Record<string, string> = {
    BUY: 'text-success bg-success/20 border-success/30',
    SELL: 'text-destructive bg-destructive/20 border-destructive/30',
    HOLD: 'text-warning bg-warning/20 border-warning/30',
  };

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-primary" />
        <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
          LLM Reasoning
        </h3>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto space-y-3 -mx-2 px-2">
        {traces.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No traces to display
          </div>
        ) : (
          traces.map((trace, index) => {
            const id = `${trace.timestamp}-${trace.model}`;
            const isExpanded = expandedId === id;
            const modelStyle = getModelIcon(trace.model);
            
            return (
              <div
                key={id}
                className="animate-slide-in bg-secondary/30 rounded-lg overflow-hidden transition-all duration-200 hover:bg-secondary/50"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  className="w-full text-left p-3"
                >
                  {/* Header row */}
                  <div className="flex items-center gap-3">
                    {/* Model badge */}
                    <div className={`w-10 h-10 rounded-lg ${modelStyle.bg} flex items-center justify-center flex-shrink-0`}>
                      <Sparkles className={`w-5 h-5 ${modelStyle.text}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-medium truncate">
                          {trace.model}
                        </span>
                        {trace.usedFallback && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-warning/20 text-warning text-xs rounded">
                            <AlertTriangle className="w-3 h-3" />
                            <span>fallback</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{formatTime(trace.timestamp)}</span>
                        <span>|</span>
                        <span>{trace.keyLabel}</span>
                      </div>
                    </div>

                    {/* Decision */}
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold border ${actionColors[trace.decision.action]}`}>
                        {trace.decision.action}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border/30">
                    {/* Confidence bar */}
                    <div className="pt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Confidence</span>
                        <span className="font-mono text-sm">
                          {(trace.decision.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            trace.decision.confidence >= 0.8 ? 'bg-success' :
                            trace.decision.confidence >= 0.6 ? 'bg-warning' :
                            'bg-destructive'
                          }`}
                          style={{ width: `${trace.decision.confidence * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Reasoning</span>
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {trace.decision.reasoning}
                      </p>
                    </div>

                    {/* Meta info */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono pt-2 border-t border-border/30">
                      <span>Price: ${trace.priceUsd.toLocaleString()}</span>
                      {trace.decision.amount > 0 && (
                        <span>Amount: ${trace.decision.amount.toLocaleString()}</span>
                      )}
                      {trace.promptVersion && (
                        <span>Prompt: {trace.promptVersion}</span>
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

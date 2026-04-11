'use client';

import { 
  Wallet, 
  TrendingUp, 
  Server, 
  Shield, 
  Brain,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Pause
} from 'lucide-react';
import type { DashboardStatus } from '@/lib/trading-types';

interface StatusPanelProps {
  status: DashboardStatus;
  onStopAgent?: () => void;
  isStopping?: boolean;
}

export function StatusPanel({ status, onStopAgent, isStopping }: StatusPanelProps) {
  const drawdownBps = status.risk?.drawdownEvidence?.currentDrawdownBps ?? 0;
  const maxDrawdownBps = status.risk?.guardrails?.maxDrawdownBps || 1000;
  const drawdownPercent = maxDrawdownBps > 0 ? (drawdownBps / maxDrawdownBps) * 100 : 0;

  return (
    <div className="glass-panel rounded-xl p-4 space-y-4">
      {/* Agent Status Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
          Agent Status
        </h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.agentRunning ? 'bg-success pulse-live' : 'bg-destructive'}`} />
          <span className={`text-xs font-medium ${status.agentRunning ? 'text-success' : 'text-destructive'}`}>
            {status.agentRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
      </div>

      {/* Status Items */}
      <div className="space-y-3">
        <StatusItem 
          icon={Wallet} 
          label="Wallet" 
          value={status.wallet.startsWith('0x') ? `${status.wallet.slice(0, 6)}...${status.wallet.slice(-4)}` : status.wallet}
          mono
        />
        <StatusItem 
          icon={TrendingUp} 
          label="Pair" 
          value={status.pair}
        />
        <StatusItem 
          icon={Brain} 
          label="Provider" 
          value={status.plannerProvider ?? 'N/A'}
          badge={status.plannerProvider === 'openai' ? 'primary' : 'secondary'}
        />
        <StatusItem 
          icon={Activity} 
          label="Strategy" 
          value={status.strategy ?? 'N/A'}
        />
        <StatusItem 
          icon={Server} 
          label="Mode" 
          value={status.mode === 'kraken' ? 'Kraken' : status.sandbox ? 'Sandbox' : 'Live'}
          badge={status.sandbox ? 'warning' : 'success'}
        />
        <StatusItem 
          icon={Shield} 
          label="Market" 
          value={status.marketMode ?? status.mode ?? 'N/A'}
        />
      </div>

      {/* Drawdown Mini Progress */}
      <div className="pt-2 border-t border-border/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Drawdown</span>
          <span className={`font-mono text-xs ${drawdownPercent > 80 ? 'text-destructive' : drawdownPercent > 50 ? 'text-warning' : 'text-success'}`}>
            {drawdownBps} / {maxDrawdownBps} bps
          </span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${
              drawdownPercent > 80 ? 'bg-destructive' : 
              drawdownPercent > 50 ? 'bg-warning' : 
              'bg-success'
            }`}
            style={{ width: `${Math.min(drawdownPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Readiness Status */}
      {status.readiness && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            {status.readiness.allChecksPassed ? (
              <CheckCircle2 className="w-4 h-4 text-success" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-warning" />
            )}
            <span className="text-xs font-medium">
              {status.readiness.allChecksPassed ? 'Ready for Submission' : 'Gates Pending'}
            </span>
          </div>
          {status.readiness.failReasons.length > 0 && (
            <div className="space-y-1">
              {status.readiness.failReasons.map((reason, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <XCircle className="w-3 h-3 text-destructive" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stop Agent Button */}
      {onStopAgent && status.agentRunning && (
        <button
          onClick={onStopAgent}
          disabled={isStopping}
          className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-destructive-foreground bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 rounded-lg transition-colors disabled:opacity-50"
        >
          <Pause className="w-4 h-4" />
          {isStopping ? 'Stopping...' : 'Stop Agent'}
        </button>
      )}
    </div>
  );
}

interface StatusItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  badge?: 'primary' | 'secondary' | 'success' | 'warning' | 'destructive';
}

function StatusItem({ icon: Icon, label, value, mono, badge }: StatusItemProps) {
  const badgeColors = {
    primary: 'bg-primary/20 text-primary border-primary/30',
    secondary: 'bg-secondary text-secondary-foreground border-border',
    success: 'bg-success/20 text-success border-success/30',
    warning: 'bg-warning/20 text-warning border-warning/30',
    destructive: 'bg-destructive/20 text-destructive border-destructive/30',
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      {badge ? (
        <span className={`text-xs px-2 py-0.5 rounded border ${badgeColors[badge]}`}>
          {value}
        </span>
      ) : (
        <span className={`text-xs ${mono ? 'font-mono' : ''}`}>{value}</span>
      )}
    </div>
  );
}

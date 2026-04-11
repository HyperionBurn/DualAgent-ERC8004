'use client';

import { 
  Shield, 
  AlertTriangle, 
  Activity,
  TrendingDown,
  Scale,
  Zap
} from 'lucide-react';
import type { DashboardRiskStatus } from '@/lib/trading-types';

interface RiskPanelProps {
  risk: DashboardRiskStatus;
}

export function RiskPanel({ risk }: RiskPanelProps) {
  const cppi = risk.cppi;
  const breaker = risk.runtimeRiskControls;
  const drawdown = risk.drawdownEvidence;

  return (
    <div className="glass-panel rounded-xl p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
          Risk Controls
        </h3>
      </div>

      {/* CPPI Gauge */}
      {cppi && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">CPPI Position Scale</span>
            <span className="font-mono text-sm font-semibold">
              {((cppi.scale ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
          <CPPIGauge 
            floorEquity={cppi.floorEquityUsd ?? 0}
            currentEquity={drawdown?.currentEquityUsd ?? 0}
            peakEquity={drawdown?.peakEquityUsd ?? 0}
            scale={cppi.scale ?? 0}
            cushionRatio={cppi.cushionRatio ?? 0}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Floor: ${(cppi.floorEquityUsd ?? 0).toLocaleString()}</span>
            <span>Cushion: ${(cppi.cushionUsd ?? 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Drawdown Meter */}
      {drawdown && (
        <div className="space-y-2 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Drawdown</span>
            </div>
            <span className={`font-mono text-sm font-semibold ${
              (drawdown.currentDrawdownBps ?? 0) > 800 ? 'text-destructive' :
              (drawdown.currentDrawdownBps ?? 0) > 500 ? 'text-warning' :
              'text-success'
            }`}>
              {drawdown.currentDrawdownBps ?? 0} bps
            </span>
          </div>
          <DrawdownMeter 
            current={drawdown.currentDrawdownBps ?? 0}
            max={risk.guardrails?.maxDrawdownBps || 1000}
          />
        </div>
      )}

      {/* Circuit Breaker Status */}
      <div className="space-y-3 pt-3 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Circuit Breaker</span>
          </div>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
            breaker?.breakerActive 
              ? 'bg-destructive/20 text-destructive border border-destructive/30' 
              : 'bg-success/20 text-success border border-success/30'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${breaker?.breakerActive ? 'bg-destructive pulse-live' : 'bg-success'}`} />
            {breaker?.breakerActive ? 'ACTIVE' : 'INACTIVE'}
          </div>
        </div>

        {breaker?.breakerActive && breaker.breakerReason && (
          <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{breaker.breakerReason}</p>
          </div>
        )}

        {breaker && !breaker.breakerActive && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
              <span className="text-muted-foreground">Consec. Losses</span>
              <span className="font-mono">{breaker.consecutiveLosses ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
              <span className="text-muted-foreground">Daily Loss</span>
              <span className="font-mono text-destructive">${(breaker.dailyLossUsd ?? 0).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Volatility Throttle */}
      {breaker && (
        <div className="space-y-2 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Volatility</span>
            </div>
            <span className={`font-mono text-sm ${breaker.volatilityThrottleActive ? 'text-warning' : 'text-foreground'}`}>
              {(breaker.volatilityPct ?? 0).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Trade Scale</span>
            </div>
            <span className="font-mono text-sm">
              {((breaker.appliedTradeScale ?? 1) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CPPIGauge({ 
  floorEquity, 
  currentEquity, 
  peakEquity,
  scale,
  cushionRatio
}: { 
  floorEquity: number;
  currentEquity: number;
  peakEquity: number;
  scale: number;
  cushionRatio: number;
}) {
  const range = peakEquity - floorEquity || 1;
  const currentPosition = ((currentEquity - floorEquity) / range) * 100;
  const clampedPosition = Math.max(0, Math.min(100, currentPosition));
  
  // Angle from -90 (floor) to 90 (peak)
  const needleAngle = (clampedPosition / 100) * 180 - 90;

  return (
    <div className="relative h-20">
      <svg viewBox="0 0 200 100" className="w-full h-full">
        {/* Background arc */}
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          className="text-secondary"
        />
        {/* Colored arc - gradient from red to green */}
        <defs>
          <linearGradient id="cppi-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="30%" stopColor="#F59E0B" />
            <stop offset="60%" stopColor="#84CC16" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          stroke="url(#cppi-gradient)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Floor marker */}
        <line x1="10" y1="100" x2="10" y2="85" stroke="#EF4444" strokeWidth="2" />
        {/* Peak marker */}
        <line x1="190" y1="100" x2="190" y2="85" stroke="#10B981" strokeWidth="2" />
        {/* Needle */}
        <line
          x1="100"
          y1="100"
          x2="100"
          y2="25"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${needleAngle} 100 100)`}
        />
        <circle cx="100" cy="100" r="6" fill="white" />
        {/* Scale value in center */}
        <text x="100" y="85" textAnchor="middle" className="fill-foreground font-mono text-lg font-bold">
          {(scale * 100).toFixed(0)}%
        </text>
      </svg>
    </div>
  );
}

function DrawdownMeter({ current, max }: { current: number; max: number }) {
  const percentage = (current / max) * 100;
  const color = 
    percentage > 80 ? 'bg-destructive' :
    percentage > 50 ? 'bg-warning' :
    'bg-success';

  return (
    <div className="relative">
      <div className="h-3 bg-secondary rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {/* Max limit marker */}
      <div 
        className="absolute top-0 h-3 w-0.5 bg-destructive"
        style={{ left: '100%', transform: 'translateX(-1px)' }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">0</span>
        <span className="text-[10px] text-destructive">{max} bps limit</span>
      </div>
    </div>
  );
}

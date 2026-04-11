'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { DashboardCheckpoint } from '@/lib/trading-types';

interface EquityChartProps {
  checkpoints: DashboardCheckpoint[];
  currentPrice?: number;
  priceChange?: number;
}

export function EquityChart({ checkpoints, currentPrice, priceChange }: EquityChartProps) {
  const chartData = useMemo(() => {
    if (!checkpoints.length) return [];
    
    return [...checkpoints]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((cp) => ({
        timestamp: cp.timestamp,
        price: cp.priceUsd,
        action: cp.action,
        confidence: cp.confidence,
        reasoning: cp.reasoning,
        time: new Date(cp.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }),
      }));
  }, [checkpoints]);

  const buyPoints = chartData.filter(d => d.action === 'BUY');
  const sellPoints = chartData.filter(d => d.action === 'SELL');

  const priceMin = Math.min(...chartData.map(d => d.price)) * 0.998;
  const priceMax = Math.max(...chartData.map(d => d.price)) * 1.002;

  if (!chartData.length) {
    return (
      <div className="glass-panel rounded-xl p-6 h-[400px] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Waiting for market data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl p-4 space-y-4">
      {/* Header with live price */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
            Price Action
          </h3>
          {currentPrice !== undefined && (
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-bold">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {priceChange !== undefined && (
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  priceChange > 0 ? 'text-success' : priceChange < 0 ? 'text-destructive' : 'text-muted-foreground'
                }`}>
                  {priceChange > 0 ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : priceChange < 0 ? (
                    <ArrowDownRight className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
                  <span>{priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-success" />
            <span className="text-muted-foreground">BUY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
            <span className="text-muted-foreground">SELL</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[320px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="rgba(255,255,255,0.05)" 
              horizontal={true}
              vertical={false}
            />
            <XAxis 
              dataKey="time" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              dy={10}
            />
            <YAxis 
              domain={[priceMin, priceMax]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#2563EB"
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
            />
            {/* Buy markers */}
            {buyPoints.map((point, i) => (
              <ReferenceDot
                key={`buy-${i}`}
                x={point.time}
                y={point.price}
                r={6}
                fill="#10B981"
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
            {/* Sell markers */}
            {sellPoints.map((point, i) => (
              <ReferenceDot
                key={`sell-${i}`}
                x={point.time}
                y={point.price}
                r={6}
                fill="#EF4444"
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  const actionColors: Record<string, string> = {
    BUY: 'text-success bg-success/20 border-success/30',
    SELL: 'text-destructive bg-destructive/20 border-destructive/30',
    HOLD: 'text-warning bg-warning/20 border-warning/30',
  };

  return (
    <div className="glass-panel rounded-lg p-3 border border-border shadow-xl max-w-xs">
      <div className="flex items-center justify-between gap-4 mb-2">
        <span className="font-mono text-lg font-bold">
          ${(data.price as number)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${actionColors[data.action as string] || ''}`}>
          {data.action as string}
        </span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Confidence:</span>
          <span className="font-mono">{((data.confidence as number) * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Time:</span>
          <span className="font-mono">{data.time as string}</span>
        </div>
      </div>
      {data.reasoning && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
          {data.reasoning as string}
        </p>
      )}
    </div>
  );
}

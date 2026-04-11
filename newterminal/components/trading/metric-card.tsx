'use client';

import { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  previousValue?: number;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  detail?: string;
  suffix?: string;
  prefix?: string;
  sparklineData?: number[];
  showTrend?: boolean;
  progress?: number; // 0-100 for progress ring
}

export function MetricCard({
  label,
  value,
  previousValue,
  tone = 'neutral',
  detail,
  suffix,
  prefix,
  sparklineData,
  showTrend = true,
  progress,
}: MetricCardProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);

  const toneColors = {
    good: 'text-success',
    warn: 'text-warning',
    bad: 'text-destructive',
    neutral: 'text-foreground',
  };

  const glowColors = {
    good: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
    warn: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
    bad: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]',
    neutral: '',
  };

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 600);
      prevValueRef.current = value;
      setDisplayValue(value);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const trend = previousValue !== undefined 
    ? typeof value === 'number' 
      ? value > previousValue ? 'up' : value < previousValue ? 'down' : 'flat'
      : 'flat'
    : null;

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className={`glass-panel rounded-xl p-4 transition-all duration-300 hover:bg-secondary/30 ${glowColors[tone]}`}>
      {/* Label */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        {showTrend && trend && (
          <TrendIcon className={`w-3.5 h-3.5 ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'}`} />
        )}
      </div>

      {/* Value with optional progress ring */}
      <div className="flex items-center gap-3">
        {progress !== undefined && (
          <div className="relative w-12 h-12 flex-shrink-0">
            <svg className="w-full h-full -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-secondary"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(progress / 100) * 125.6} 125.6`}
                className={toneColors[tone]}
              />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className={`font-mono text-2xl font-bold tracking-tight ${toneColors[tone]} ${isAnimating ? (trend === 'up' ? 'flash-positive' : trend === 'down' ? 'flash-negative' : '') : ''}`}>
            {prefix}{displayValue}{suffix}
          </div>
          {detail && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{detail}</p>
          )}
        </div>
      </div>

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 1 && (
        <div className="mt-3 h-8">
          <Sparkline data={sparklineData} tone={tone} />
        </div>
      )}
    </div>
  );
}

function Sparkline({ data, tone }: { data: number[]; tone: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const strokeColor = {
    good: '#10B981',
    warn: '#F59E0B',
    bad: '#EF4444',
    neutral: '#2563EB',
  }[tone] || '#2563EB';

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={`sparkline-gradient-${tone}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,100 ${points} 100,100`}
        fill={`url(#sparkline-gradient-${tone})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

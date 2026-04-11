'use client';

import { Fuel, Brain, BarChart3, Percent } from 'lucide-react';
import type { DashboardMarketContext } from '@/lib/trading-types';

interface MarketContextProps {
  data: DashboardMarketContext;
}

export function MarketContext({ data }: MarketContextProps) {
  const fearGreedValue = parseInt(data.fearGreed.value);
  const fearGreedColor = 
    fearGreedValue >= 80 ? 'text-success' :
    fearGreedValue >= 60 ? 'text-success/80' :
    fearGreedValue >= 40 ? 'text-warning' :
    fearGreedValue >= 20 ? 'text-destructive/80' :
    'text-destructive';

  return (
    <div className="glass-panel rounded-xl px-4 py-3 flex items-center justify-between gap-4 overflow-x-auto">
      {/* Gas */}
      <ContextItem 
        icon={Fuel} 
        label="Gas" 
        value={data.networkGas}
        iconColor="text-warning"
      />
      
      <div className="h-4 w-px bg-border flex-shrink-0" />
      
      {/* Fear & Greed */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-xs text-muted-foreground">Fear/Greed</span>
        </div>
        <div className="flex items-center gap-2">
          <FearGreedGauge value={fearGreedValue} />
          <div className="flex flex-col">
            <span className={`font-mono text-sm font-semibold ${fearGreedColor}`}>
              {data.fearGreed.value}
            </span>
            <span className="text-[10px] text-muted-foreground">{data.fearGreed.class}</span>
          </div>
        </div>
      </div>
      
      <div className="h-4 w-px bg-border flex-shrink-0" />
      
      {/* Depth Tilt */}
      <ContextItem 
        icon={BarChart3} 
        label="Depth" 
        value={data.depthTilt}
        valueColor={data.depthTilt === 'bid-heavy' ? 'text-success' : data.depthTilt === 'ask-heavy' ? 'text-destructive' : undefined}
      />
      
      <div className="h-4 w-px bg-border flex-shrink-0" />
      
      {/* Funding Rate */}
      <ContextItem 
        icon={Percent} 
        label="Funding" 
        value={data.fundingRate}
        valueColor={data.fundingRate.startsWith('+') ? 'text-success' : data.fundingRate.startsWith('-') ? 'text-destructive' : undefined}
      />
    </div>
  );
}

interface ContextItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  iconColor?: string;
  valueColor?: string;
}

function ContextItem({ icon: Icon, label, value, iconColor, valueColor }: ContextItemProps) {
  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-4 h-4 ${iconColor || 'text-muted-foreground'}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={`font-mono text-sm font-medium ${valueColor || 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

function FearGreedGauge({ value }: { value: number }) {
  // Semi-circle gauge
  const angle = (value / 100) * 180 - 90; // -90 to 90 degrees
  
  return (
    <div className="relative w-10 h-5 overflow-hidden">
      <svg viewBox="0 0 100 50" className="w-full h-full">
        {/* Background arc */}
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-secondary"
        />
        {/* Gradient arc */}
        <defs>
          <linearGradient id="fear-greed-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="25%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#EAB308" />
            <stop offset="75%" stopColor="#84CC16" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          fill="none"
          stroke="url(#fear-greed-gradient)"
          strokeWidth="8"
          strokeDasharray={`${(value / 100) * 141.4} 141.4`}
        />
        {/* Needle */}
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="15"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${angle} 50 50)`}
        />
        <circle cx="50" cy="50" r="4" fill="white" />
      </svg>
    </div>
  );
}

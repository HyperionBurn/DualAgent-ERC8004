import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, CartesianGrid } from 'recharts';

interface EquityChartProps {
  checkpoints: { timestamp: number; priceUsd: number; action: string; }[];
}

export default function EquityChart({ checkpoints }: EquityChartProps) {
  const data = useMemo(() => {
    return [...checkpoints].reverse().map(cp => ({
      time: new Date(cp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      price: cp.priceUsd,
      action: cp.action,
      isBuy: cp.action === 'BUY' ? cp.priceUsd : null,
      isSell: cp.action === 'SELL' ? cp.priceUsd : null,
    }));
  }, [checkpoints]);

  if (data.length === 0) {
    return <div className="card empty-state">Waiting for market data...</div>;
  }

  const minPrice = Math.min(...data.map(d => d.price));
  const maxPrice = Math.max(...data.map(d => d.price));
  const domainDelta = (maxPrice - minPrice) * 0.1;

  return (
    <div className="card glass-panel" style={{ height: '350px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <h3 className="panel-title">LIVE MARKET & EXECUTION VECTOR</h3>
      <div style={{ flex: 1, width: '100%', marginTop: '15px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0070F3" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#0070F3" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#252528" vertical={false} />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
            <YAxis domain={[minPrice - domainDelta, maxPrice + domainDelta]} tickFormatter={(val) => `$${val.toLocaleString()}`} stroke="#6b7280" fontSize={11} width={70} axisLine={false} tickLine={false} orientation="right" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1C1C1F', borderColor: '#2e2e32', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
              itemStyle={{ color: '#0070F3' }}
              labelStyle={{ color: '#888' }}
            />
            <Area type="monotone" dataKey="price" stroke="#0070F3" strokeWidth={3} fillOpacity={1} fill="url(#colorPrice)" />
            
            {data.map((entry, index) => (
              entry.isBuy && (
                <ReferenceDot key={`buy-${index}`} x={entry.time} y={entry.price} r={5} fill="#059669" stroke="#1C1C1F" strokeWidth={2} />
              )
            ))}
            {data.map((entry, index) => (
              entry.isSell && (
                <ReferenceDot key={`sell-${index}`} x={entry.time} y={entry.price} r={5} fill="#dc2626" stroke="#1C1C1F" strokeWidth={2} />
              )
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

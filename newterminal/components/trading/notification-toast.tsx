'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import type { TradeNotification } from '@/hooks/use-trade-notifications';

interface NotificationToastProps {
  notification: TradeNotification | null;
  onDismiss: () => void;
}

export function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification, onDismiss]);

  if (!notification) return null;

  const isBuy = notification.action === 'BUY';

  return (
    <div
      className={`fixed top-20 right-4 z-[100] animate-toast-slide-in transition-all duration-300 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div
        className={`glass-panel rounded-lg border-l-4 ${
          isBuy ? 'border-l-success' : 'border-l-destructive'
        } p-4 w-72 shadow-lg cursor-pointer`}
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 300);
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {isBuy ? (
              <TrendingUp className="w-5 h-5 text-success" />
            ) : (
              <TrendingDown className="w-5 h-5 text-destructive" />
            )}
            <span className={`font-semibold text-sm ${isBuy ? 'text-success' : 'text-destructive'}`}>
              {notification.action}
            </span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setVisible(false); setTimeout(onDismiss, 300); }}>
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pair</span>
            <span className="font-mono">{notification.pair}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-mono">${notification.amountUsd.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Price</span>
            <span className="font-mono">${notification.priceUsd.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Confidence</span>
            <span className={`font-mono font-semibold ${
              notification.confidence >= 0.8 ? 'text-success' :
              notification.confidence >= 0.6 ? 'text-warning' : 'text-muted-foreground'
            }`}>
              {(notification.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

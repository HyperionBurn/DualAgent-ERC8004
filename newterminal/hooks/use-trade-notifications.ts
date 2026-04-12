'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DashboardCheckpoint } from '@/lib/trading-types';

export interface TradeNotification {
  action: 'BUY' | 'SELL';
  pair: string;
  amountUsd: number;
  priceUsd: number;
  confidence: number;
  timestamp: number;
}

function playTradeSound(action: 'BUY' | 'SELL') {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = action === 'BUY' ? 880 : 440;
    osc.type = 'sine';
    gain.gain.value = 0.08;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // Silently fail if audio not available
  }
}

function showBrowserNotification(notification: TradeNotification) {
  try {
    if (Notification.permission === 'granted') {
      new Notification(`FluxAgent ${notification.action}`, {
        body: `${notification.pair} — $${notification.amountUsd.toLocaleString()} @ $${notification.priceUsd.toLocaleString()} (${(notification.confidence * 100).toFixed(0)}%)`,
        icon: '/favicon.ico',
        tag: `trade-${notification.timestamp}`,
      });
    }
  } catch {
    // Silently fail if notifications not available
  }
}

export function useTradeNotifications(checkpoints: DashboardCheckpoint[]) {
  const [latestNotification, setLatestNotification] = useState<TradeNotification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenTimestampRef = useRef(0);
  const initializedRef = useRef(false);
  const permissionRequestedRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Notification API not available
      }
    }
  }, []);

  useEffect(() => {
    if (!initializedRef.current) {
      lastSeenTimestampRef.current = checkpoints.reduce(
        (latest, checkpoint) => Math.max(latest, checkpoint.timestamp),
        0
      );
      initializedRef.current = true;
      return;
    }

    const trades = checkpoints.filter(
      (cp) => cp.action !== 'HOLD' && cp.timestamp > lastSeenTimestampRef.current
    );

    if (trades.length > 0) {
      const latest = trades[trades.length - 1];
      lastSeenTimestampRef.current = latest.timestamp;

      const notification: TradeNotification = {
        action: latest.action as 'BUY' | 'SELL',
        pair: latest.pair,
        amountUsd: latest.amountUsd,
        priceUsd: latest.priceUsd,
        confidence: latest.confidence,
        timestamp: latest.timestamp,
      };

      setLatestNotification(notification);
      setUnreadCount((current) => current + 1);
      playTradeSound(notification.action);

      if (!permissionRequestedRef.current) {
        permissionRequestedRef.current = true;
        void requestPermission();
      }
      showBrowserNotification(notification);
    }
  }, [checkpoints, requestPermission]);

  const clearLatestNotification = useCallback(() => {
    setLatestNotification(null);
    setUnreadCount(0);
  }, []);

  return { latestNotification, unreadCount, requestPermission, clearLatestNotification };
}

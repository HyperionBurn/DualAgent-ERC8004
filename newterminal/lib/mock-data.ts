import type {
  DashboardSnapshot,
  DashboardStatus,
  DashboardCheckpoint,
  DashboardTrace,
  DashboardMetrics,
  DashboardMarketContext,
  Attestation,
} from './trading-types';

// Generate realistic price data
function generatePriceHistory(basePrice: number, count: number): number[] {
  const prices: number[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * 50; // Slight upward bias
    price = Math.max(1500, Math.min(2500, price + change));
    prices.push(price);
  }
  return prices;
}

const basePrice = 1842.56;
const priceHistory = generatePriceHistory(basePrice, 50);

export const mockStatus: DashboardStatus = {
  agentId: 'agent-0xA7B3...F2D9',
  wallet: '0xA7B3C4D5E6F7890123456789ABCDEF0123456F2D9',
  pair: 'ETH/USD',
  mode: 'sandbox',
  marketMode: 'live',
  strategy: 'momentum',
  plannerProvider: 'openai',
  sandbox: true,
  agentRunning: true,
  agentRuntimePid: 42891,
  risk: {
    guardrails: {
      maxPositionUsd: 10000,
      maxDrawdownBps: 1000,
      maxTradesPerHour: 12,
      active: true,
      defaultCapUsd: 5000,
    },
    drawdownEvidence: {
      maxDrawdownBps: 1000,
      currentDrawdownBps: 234,
      currentEquityUsd: 10234.56,
      peakEquityUsd: 10478.12,
      asOfTimestamp: Date.now(),
    },
    cppi: {
      floorRatio: 0.85,
      multiplier: 2.5,
      floorEquityUsd: 8500,
      cushionUsd: 1734.56,
      cushionRatio: 0.17,
      scale: 0.65,
    },
    runtimeRiskControls: {
      breakerActive: false,
      breakerReason: null,
      consecutiveLosses: 1,
      dailyLossUsd: 45.23,
      volatilityThrottleActive: false,
      volatilityPct: 2.4,
      appliedTradeScale: 0.85,
    },
  },
  reputationContext: {
    feedbackCount: 47,
    failureContextCount: 3,
    latestFeedback: {
      timestamp: Date.now() - 120000,
      score: 92,
      feedbackType: 'positive',
      txid: '0x1234...5678',
      intentHash: '0xABCD...EF01',
    },
    latestFailureContext: null,
  },
  readiness: {
    allChecksPassed: true,
    failReasons: [],
    runLabel: 'hackathon-v1',
    evidenceDepth: {
      enabled: true,
      pass: true,
      checkpointCount: 42,
      fillCount: 18,
    },
    runQuality: {
      enabled: true,
      pass: true,
      netPnlUsd: 234.56,
      maxDrawdownObservedBps: 234,
    },
  },
  contracts: {
    validator: '0x1234567890123456789012345678901234567890',
    reputation: '0x0987654321098765432109876543210987654321',
  },
};

export const mockCheckpoints: DashboardCheckpoint[] = [
  {
    timestamp: Date.now() - 60000,
    action: 'BUY',
    pair: 'ETH/USD',
    amountUsd: 1250.00,
    priceUsd: 1842.56,
    reasoning: 'Strong momentum breakout above 200 SMA with increasing volume. RSI showing bullish divergence at 58. Order flow indicates institutional accumulation pattern.',
    confidence: 0.87,
    intentHash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
    signerAddress: '0xA7B3C4D5E6F7890123456789ABCDEF0123456F2D9',
    model: 'gpt-4o',
    keyLabel: 'openai-primary',
  },
  {
    timestamp: Date.now() - 180000,
    action: 'HOLD',
    pair: 'ETH/USD',
    amountUsd: 0,
    priceUsd: 1839.12,
    reasoning: 'Waiting for confirmation of support level at $1,835. Volume profile suggests consolidation phase. Risk/reward not favorable for new entry.',
    confidence: 0.62,
    intentHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    signerAddress: '0xA7B3C4D5E6F7890123456789ABCDEF0123456F2D9',
    model: 'claude-sonnet-4-20250514',
    keyLabel: 'anthropic-secondary',
  },
  {
    timestamp: Date.now() - 300000,
    action: 'SELL',
    pair: 'ETH/USD',
    amountUsd: 800.00,
    priceUsd: 1854.78,
    reasoning: 'Taking partial profits at resistance zone. Bearish divergence forming on 4H RSI. Reducing exposure ahead of FOMC announcement.',
    confidence: 0.79,
    intentHash: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
    signerAddress: '0xA7B3C4D5E6F7890123456789ABCDEF0123456F2D9',
    model: 'gpt-4o',
    keyLabel: 'openai-primary',
  },
  {
    timestamp: Date.now() - 420000,
    action: 'BUY',
    pair: 'ETH/USD',
    amountUsd: 950.00,
    priceUsd: 1828.34,
    reasoning: 'Bullish engulfing candle on 1H chart. VWAP reclaim with above-average volume. Funding rates turning positive.',
    confidence: 0.84,
    intentHash: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
    signerAddress: '0xA7B3C4D5E6F7890123456789ABCDEF0123456F2D9',
    model: 'gpt-4o',
    keyLabel: 'openai-primary',
  },
  {
    timestamp: Date.now() - 540000,
    action: 'HOLD',
    pair: 'ETH/USD',
    amountUsd: 0,
    priceUsd: 1835.90,
    reasoning: 'Market in consolidation range. Waiting for breakout confirmation above $1,850 or breakdown below $1,820.',
    confidence: 0.55,
    intentHash: '0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
    signerAddress: '0xA7B3C4D5E6F7890123456789ABCDEF0123456F2D9',
    model: 'claude-sonnet-4-20250514',
    keyLabel: 'anthropic-secondary',
  },
  {
    timestamp: Date.now() - 660000,
    action: 'BUY',
    pair: 'ETH/USD',
    amountUsd: 1100.00,
    priceUsd: 1815.23,
    reasoning: 'Oversold bounce from key support. Positive divergence on multiple timeframes. Accumulation signal from on-chain metrics.',
    confidence: 0.91,
    intentHash: '0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f',
    signerAddress: '0xA7B3C4D5E6F7890123456789ABCDEF0123456F2D9',
    model: 'gpt-4o',
    keyLabel: 'openai-primary',
  },
];

export const mockTraces: DashboardTrace[] = [
  {
    agentId: 'agent-0xA7B3...F2D9',
    timestamp: Date.now() - 45000,
    pair: 'ETH/USD',
    priceUsd: 1842.56,
    model: 'gpt-4o',
    keyLabel: 'openai-primary',
    usedFallback: false,
    decision: {
      action: 'BUY',
      amount: 1250.00,
      confidence: 0.87,
      reasoning: 'Strong momentum indicators aligned with positive market structure. Volume confirms institutional interest.',
    },
    promptVersion: 'v2.3.1',
  },
  {
    agentId: 'agent-0xA7B3...F2D9',
    timestamp: Date.now() - 165000,
    pair: 'ETH/USD',
    priceUsd: 1839.12,
    model: 'claude-sonnet-4-20250514',
    keyLabel: 'anthropic-secondary',
    usedFallback: true,
    decision: {
      action: 'HOLD',
      amount: 0,
      confidence: 0.62,
      reasoning: 'Insufficient confirmation for directional trade. Risk management suggests waiting for clearer signal.',
    },
    promptVersion: 'v2.3.1',
  },
  {
    agentId: 'agent-0xA7B3...F2D9',
    timestamp: Date.now() - 285000,
    pair: 'ETH/USD',
    priceUsd: 1854.78,
    model: 'gpt-4o',
    keyLabel: 'openai-primary',
    usedFallback: false,
    decision: {
      action: 'SELL',
      amount: 800.00,
      confidence: 0.79,
      reasoning: 'Resistance rejection with bearish divergence. Taking profits to reduce exposure.',
    },
    promptVersion: 'v2.3.1',
  },
  {
    agentId: 'agent-0xA7B3...F2D9',
    timestamp: Date.now() - 405000,
    pair: 'ETH/USD',
    priceUsd: 1828.34,
    model: 'gpt-4o',
    keyLabel: 'openai-primary',
    usedFallback: false,
    decision: {
      action: 'BUY',
      amount: 950.00,
      confidence: 0.84,
      reasoning: 'Technical setup favoring long entry. Multiple timeframe confluence.',
    },
    promptVersion: 'v2.3.0',
  },
];

export const mockMetrics: DashboardMetrics = {
  generatedAt: new Date().toISOString(),
  summary: {
    agentId: 'agent-0xA7B3...F2D9',
    mode: 'sandbox',
    netPnlUsd: 234.56,
    realizedPnlUsd: 189.23,
    unrealizedPnlUsd: 45.33,
    maxDrawdownBps: 234,
    averageValidationScore: 87.5,
    validationSource: 'on-chain',
    validationCoveragePct: 98.2,
    averageReputationScore: 4.2,
    reputationSource: 'feedback-oracle',
    reputationFeedbackCount: 47,
    riskAdjustedProfitabilityScore: 78.4,
    drawdownControlScore: 91.2,
    validationQualityScore: 87.5,
    objectiveReputationScore: 84.0,
    compositeScore: 85.3,
    checkpointCount: 42,
    fillCount: 18,
    openPositionBase: 0.45,
    recentFlow: '2 BUY → 1 SELL → 3 HOLD',
  },
  leaderboard: [
    { rank: 1, agentId: 'agent-0xDEAD...BEEF', netPnlUsd: 1245.67, maxDrawdownBps: 156, validationScore: 94.2, reputationScore: 4.8, compositeScore: 92.1, checkpointCount: 89 },
    { rank: 2, agentId: 'agent-0xCAFE...BABE', netPnlUsd: 892.34, maxDrawdownBps: 203, validationScore: 89.7, reputationScore: 4.5, compositeScore: 88.4, checkpointCount: 67 },
    { rank: 3, agentId: 'agent-0xA7B3...F2D9', netPnlUsd: 234.56, maxDrawdownBps: 234, validationScore: 87.5, reputationScore: 4.2, compositeScore: 85.3, checkpointCount: 42 },
  ],
  recentActions: [],
};

export const mockMarketContext: DashboardMarketContext = {
  fearGreed: { value: '72', class: 'Greed' },
  networkGas: '8 gwei',
  depthTilt: 'bid-heavy',
  fundingRate: '+0.012%',
  timestamp: Date.now(),
};

export const mockAttestations: Attestation[] = [
  {
    timestamp: Date.now() - 30000,
    intentHash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
    validator: '0x1234567890123456789012345678901234567890',
    score: 94,
    txid: '0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
  },
  {
    timestamp: Date.now() - 150000,
    intentHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    validator: '0x1234567890123456789012345678901234567890',
    score: 78,
  },
  {
    timestamp: Date.now() - 270000,
    intentHash: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
    validator: '0x1234567890123456789012345678901234567890',
    score: 92,
    txid: '0xef011234ef011234ef011234ef011234ef011234ef011234ef011234ef011234',
  },
  {
    timestamp: Date.now() - 390000,
    intentHash: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
    validator: '0x1234567890123456789012345678901234567890',
    score: 45,
  },
];

export const mockSnapshot: DashboardSnapshot = {
  status: mockStatus,
  price: { price: 1842.56, timestamp: Date.now() },
  checkpoints: mockCheckpoints,
  traces: mockTraces,
  metrics: mockMetrics,
};

export { priceHistory };

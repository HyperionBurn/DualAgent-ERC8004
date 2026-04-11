# 🔥 HYPERPROMPT: FluxAgent Trading Console — Award-Winning Dashboard Redesign

> **Purpose**: Hand this document to a UI creator/agency. It contains every detail of the current operator dashboard — data contracts, component architecture, visual design, layout, animations, and API surface — plus a comprehensive vision for elevating it to masterclass/award-winning quality.

---

## 1 · PROJECT OVERVIEW

### What This Is
A **real-time AI trading agent console** — the operator's live control center for monitoring an autonomous trading agent. The agent runs dual-LLM consensus (two models cross-validate every trade decision), maintains on-chain validation proofs, and manages risk through CPPI drawdown controls and circuit breakers.

### Tech Stack (Current)
- **React 19** + **Vite 6** (plain JS, no TypeScript in UI source currently)
- **Recharts 3.8.1** for charts
- **Lucide React** for icons
- **Plain CSS** with CSS custom properties (no Tailwind, no CSS-in-JS, no component library)
- **4-second polling** for live data refresh via REST (`Promise.allSettled` for 5 concurrent API calls)
- Backend: Express API served by `scripts/dashboard.ts`

### Target Stack (Recommended Upgrades)
- **React 19** + **Vite 6** (keep)
- **Tailwind CSS v4** or keep plain CSS but with a design token system
- **Recharts** upgraded or replaced with **Visx** / **Lightweight Charts** (TradingView) for the equity chart
- **Framer Motion** for cinematic page transitions and micro-interactions
- **TanStack Query** for data fetching (replaces manual `useEffect` + `setInterval` polling)
- Optional: **Radix UI** primitives for accessible dropdowns/tooltips

---

## 2 · CURRENT LAYOUT ARCHITECTURE

The dashboard uses a **single-page vertical stack** layout, max width 1440px, centered:

```
┌─────────────────────────────────────────────────────────┐
│  MARKET CONTEXT STRIP  (gas | fear/greed | tilt | rate) │
├────────────────────────────┬────────────────────────────┤
│                            │                            │
│   HERO CARD — Left Column  │   HERO CARD — Right Column │
│   Agent name, status,      │   LIVE PRICE BLOCK         │
│   status chips, stop btn   │   $XX,XXX.XX  +X.XX%      │
│                            │                            │
├────────────────────────────┴────────────────────────────┤
│                                                         │
│   MASTERCLASS GRID (2fr : 1fr)                          │
│   ┌──────────────────────┐ ┌─────────────────────────┐ │
│   │  EQUITY CHART        │ │  VALIDATION PROOFS      │ │
│   │  (Recharts AreaChart)│ │  (on-chain proof table) │ │
│   │  BUY/SELL dots       │ │  hash, validator, score │ │
│   └──────────────────────┘ └─────────────────────────┘ │
│                                                         │
│   METRICS GRID (4 × MetricCard)                        │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│   │Composite│ │ Net PnL │ │Drawdown │ │Reputatn │    │
│   │ Score   │ │         │ │         │ │         │    │
│   └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
│                                                         │
│   LAYOUT GRID (1fr : 1fr)                              │
│   ┌──────────────────────┐ ┌─────────────────────────┐ │
│   │  CHECKPOINT FEED     │ │  TRACE FEED             │ │
│   │  (last 6 decisions)  │ │  (last 6 planner runs)  │ │
│   │  action, pair, conf, │ │  model, decision,       │ │
│   │  reasoning, price    │ │  reasoning              │ │
│   └──────────────────────┘ └─────────────────────────┘ │
│                                                         │
│   FOOTER BAR (agent ID, feed mode, drawdown, updated)  │
└─────────────────────────────────────────────────────────┘
```

### Current Visual Theme
- **Dark theme only**: Background `#0A0A0B` with animated mesh gradient (4 radial gradients shifting over 20s)
- **Perspective grid overlay**: `body::after` pseudo-element with 3D-transformed grid lines fading outward
- **Glassmorphism**: All panels use `backdrop-filter: blur(12px)` + semi-transparent backgrounds
- **Typography**: Inter for body, JetBrains Mono for labels/data, system-ui fallback
- **Color palette**:
  - Accent: `#0070F3` (electric blue)
  - Good: `#10B981` (emerald)
  - Warn: `#F5A623` (amber)
  - Bad: `#EF4444` (red)
  - Text: `#F3F4F6`
  - Muted: `#9CA3AF`

---

## 3 · COMPLETE DATA CONTRACTS

Every interface the UI consumes (from `lib/api.ts`):

### `DashboardSnapshot` — The Main Payload (polled every 4 seconds)
```typescript
interface DashboardSnapshot {
  status: DashboardStatus | null;
  price: DashboardPrice | null;
  checkpoints: DashboardCheckpoint[];
  traces: DashboardTrace[];
  metrics: DashboardMetrics | null;
}
```

### `DashboardStatus` — Agent Identity & Risk
```typescript
interface DashboardStatus {
  agentId: string;                    // e.g., "agent-0xABC...DEF"
  wallet: string;                     // Ethereum address
  pair: string;                       // e.g., "ETH/USD"
  mode: string;                       // e.g., "sandbox"
  marketMode?: string;                // e.g., "mock" | "live"
  strategy?: string;                  // e.g., "momentum"
  plannerProvider?: string;           // e.g., "openai" | "anthropic"
  sandbox: boolean;                   // true if paper trading
  agentRunning?: boolean;             // is the agent process alive?
  agentRuntimePid?: number | null;    // OS process ID
  risk?: DashboardRiskStatus | null;
  reputationContext?: DashboardReputationContext | null;
  readiness?: DashboardReadinessStatus | null;
  contracts: Record<string, string | null>;  // deployed contract addresses
}
```

### `DashboardRiskStatus` — Circuit Breaker & CPPI
```typescript
interface DashboardRiskStatus {
  guardrails: {
    maxPositionUsd: number | null;
    maxDrawdownBps: number | null;
    maxTradesPerHour: number | null;
    active: boolean | null;
    defaultCapUsd: number | null;
  } | null;
  drawdownEvidence: {
    maxDrawdownBps: number | null;
    currentDrawdownBps: number | null;
    currentEquityUsd: number | null;
    peakEquityUsd: number | null;
    asOfTimestamp: number | null;
  } | null;
  cppi?: {
    floorRatio: number | null;        // e.g., 0.85 = 85% capital floor
    multiplier: number | null;        // e.g., 2.5
    floorEquityUsd: number | null;
    cushionUsd: number | null;
    cushionRatio: number | null;
    scale: number | null;             // position scaling factor 0-1
  } | null;
  runtimeRiskControls?: {
    breakerActive: boolean | null;    // is circuit breaker tripped?
    breakerReason: string | null;     // why it tripped
    consecutiveLosses: number | null;
    dailyLossUsd: number | null;
    volatilityThrottleActive: boolean | null;
    volatilityPct: number | null;
    appliedTradeScale: number | null; // reduced position size
  } | null;
}
```

### `DashboardReputationContext` — On-Chain Feedback
```typescript
interface DashboardReputationContext {
  feedbackCount: number;
  failureContextCount: number;
  latestFeedback: {
    timestamp: number | null;
    score: number | null;
    feedbackType: string | null;
    txid: string | null;
    intentHash: string | null;
  } | null;
  latestFailureContext: {
    timestamp: number | null;
    action: string | null;
    pair: string | null;
    deltaNetPnlUsd: number | null;
    cppiScale: number | null;
    breakerState: string | null;
    txid: string | null;
    intentHash: string | null;
  } | null;
}
```

### `DashboardReadinessStatus` — Hackathon Submission Gates
```typescript
interface DashboardReadinessStatus {
  allChecksPassed: boolean | null;
  failReasons: string[];
  runLabel: string | null;
  evidenceDepth: {
    enabled: boolean;
    pass: boolean;
    checkpointCount: number | null;
    fillCount: number | null;
    // ... range checks
  } | null;
  runQuality: {
    enabled: boolean;
    pass: boolean;
    netPnlUsd: number | null;
    maxDrawdownObservedBps: number | null;
    // ... pnl/drawdown pass flags
  } | null;
}
```

### `DashboardPrice` — Live Price Tick
```typescript
interface DashboardPrice {
  price: number | null;    // e.g., 1842.56
  timestamp?: number | null;
}
```

### `DashboardCheckpoint` — Trade Decision Record
```typescript
interface DashboardCheckpoint {
  timestamp: number;       // Unix ms
  action: string;          // "BUY" | "SELL" | "HOLD"
  pair: string;            // "ETH/USD"
  amountUsd: number;       // trade size
  priceUsd: number;        // execution price
  reasoning: string;       // LLM reasoning text
  confidence: number;      // 0-1
  intentHash: string;      // EIP-712 hash
  signerAddress: string;   // wallet
  checkpointHash?: string;
  model?: string;          // which LMA model
  keyLabel?: string;       // model key identifier
  promptVersion?: string;
}
```

### `DashboardTrace` — Planner Reasoning Trace
```typescript
interface DashboardTrace {
  agentId?: string;
  timestamp: number;
  pair: string;
  priceUsd: number;
  model: string;           // e.g., "gpt-4o", "claude-sonnet-4-20250514"
  keyLabel: string;        // e.g., "openai-primary"
  usedFallback: boolean;   // did it fall back to backup model?
  decision: {
    action: string;
    amount: number;
    confidence: number;
    reasoning: string;
  };
  promptVersion?: string;
  toolResults?: string;
}
```

### `DashboardMetrics` — Scoring Summary
```typescript
interface DashboardMetrics {
  generatedAt: string;
  summary: DashboardMetricSummary;
  leaderboard: Array<{
    rank: number;
    agentId: string;
    netPnlUsd: number;
    maxDrawdownBps: number;
    validationScore: number;
    reputationScore: number;
    compositeScore: number;
    checkpointCount: number;
  }>;
  recentActions: Array<{
    timestamp: number;
    action: string;
    pair: string;
    amountUsd: number;
    confidence: number;
    reasoning: string;
  }>;
}

interface DashboardMetricSummary {
  agentId: string;
  mode: string;
  netPnlUsd: number;                    // total PnL
  realizedPnlUsd: number;               // closed trades
  unrealizedPnlUsd: number;             // open position
  maxDrawdownBps: number;               // worst drawdown
  averageValidationScore: number;        // on-chain validation avg
  validationSource: string;
  validationCoveragePct: number;
  averageReputationScore: number;
  reputationSource: string;
  reputationFeedbackCount: number;
  riskAdjustedProfitabilityScore: number; // sub-score
  drawdownControlScore: number;          // sub-score
  validationQualityScore: number;        // sub-score
  objectiveReputationScore: number;      // sub-score
  compositeScore: number;                // 0-100 overall
  checkpointCount: number;
  fillCount: number;
  openPositionBase: number;
  recentFlow: string;                    // e.g., "2 BUY → 1 SELL → 3 HOLD"
}
```

### `DashboardMarketContext` — Macro Indicators (separate 10s poll)
```typescript
interface DashboardMarketContext {
  fearGreed: { value: string; class: string };  // "72", "Greed"
  networkGas: string;     // "8 gwei"
  depthTilt: string;      // "bid-heavy"
  fundingRate: string;    // "+0.012%"
  timestamp: number;
}
```

### API Endpoints
| Endpoint | Method | Returns | Poll Interval |
|----------|--------|---------|---------------|
| `/api/status` | GET | `DashboardStatus` | 4s |
| `/api/price` | GET | `DashboardPrice` | 4s |
| `/api/checkpoints` | GET | `DashboardCheckpoint[]` | 4s |
| `/api/traces` | GET | `DashboardTrace[]` | 4s |
| `/api/metrics` | GET | `DashboardMetrics` | 4s |
| `/api/market-context` | GET | `DashboardMarketContext` | 10s |
| `/api/attestations` | GET | `Attestation[]` | 6s |
| `/api/agent/stop` | POST | `AgentStopResult` | on demand |

---

## 4 · CURRENT COMPONENT INVENTORY

### 4.1 `App.tsx` — Root Component
- **State**: `snapshot`, `error`, `lastUpdated`, `isStopping`, `controlMessage`, `controlError`
- **Polling**: `setInterval(refreshSnapshot, 4000)` on mount
- **Layout sections**: MarketContext → HeroCard → MasterclassGrid → MetricsGrid → LayoutGrid → Footer
- **Computed values**: `priceNow`, `priceChangePct`, `currentDrawdownBps`, `guardrailDrawdownBps`
- **Actions**: Stop agent button (POST `/api/agent/stop`)
- **Loading state**: Shows "Booting planner, metrics, and trace channels." skeleton

### 4.2 `MetricCard.tsx` — Single KPI Card
```
Props: { label: string, value: string, tone: "good"|"warn"|"bad"|"muted", detail?: string }
```
- Renders a glass-panel card with large value (color-coded by tone), label above, detail text below
- Uses classes: `.metric-card`, `.metric-value`, `.tone-good/.tone-bad`

### 4.3 `StatusChips.tsx` — Status Pill Array
```
Props: { status: DashboardStatus }
```
- Renders up to 8 chip pills: Mode, Market, Provider, Strategy, Sandbox, Running, Drawdown, Agent ID
- Each chip: monospace uppercase text, subtle background, color varies by state (accent/warning/danger)
- Currently shows drawdown as `chip warning` or `chip danger` based on threshold

### 4.4 `MarketContext.tsx` — Macro Data Strip
- Self-fetching (independent 10s poll to `/api/market-context`)
- Horizontal strip with: Gas price, Fear & Greed index (color-coded), Order depth tilt, Funding rate
- Uses `lucide-react` icons: `Fuel`, `Brain`, `BarChart3`, `Percent`
- Compact monospace display with dividers between items

### 4.5 `EquityChart.tsx` — Price + Execution Vector
```
Props: { checkpoints: { timestamp, priceUsd, action }[] }
```
- **Recharts `AreaChart`** with:
  - Blue gradient fill under the price line
  - `CartesianGrid` with `#252528` dashed lines (horizontal only)
  - Green `ReferenceDot` for BUY actions, red for SELL actions
  - Custom tooltip with dark theme styling
  - Y-axis: USD formatted, domain auto-scaled with 10% padding
  - X-axis: time formatted as HH:MM:SS
- Height: 350px fixed
- Empty state: "Waiting for market data..."

### 4.6 `ValidationProofs.tsx` — On-Chain Proof Table
- Self-fetching (independent 6s poll to `/api/attestations`)
- Table columns: TIME | EIP-712 INTENT HASH | VALIDATOR | SCORE
- Hash displayed in monospace box, truncated to 16 chars
- Validator links to `sepolia.etherscan.io/address/...`
- Score badges: `excellence` (≥90, green glow), `average` (≥50, amber), `poor` (<50, red)
- Uses `ShieldCheck` and `Link2` icons from Lucide

### 4.7 `CheckpointFeed.tsx` — Trade Decision Feed
```
Props: { checkpoints: DashboardCheckpoint[] }
```
- Shows last 6 checkpoints in a scrollable list (500px height)
- Each item shows: Action badge (BUY/SELL/HOLD with color), Pair, Confidence %, Reasoning text, Price, Timestamp
- Uses `.feed-list`, `.feed-item` CSS with hover elevation effect
- Actions styled: BUY (green bg + border), SELL (red), HOLD (amber)

### 4.8 `TraceFeed.tsx` — Planner Reasoning Feed
```
Props: { traces: DashboardTrace[] }
```
- Shows last 6 traces in a scrollable list (500px height)
- Each item shows: Model name, Key label, Decision action (colored badge), Reasoning text, Timestamp
- Shows "↩ fallback" indicator when `usedFallback === true`
- Same feed styling as CheckpointFeed

### 4.9 `Sparkline.tsx` — Mini Inline Chart
```
Props: { values: number[] }
```
- Pure SVG polyline, no library dependency
- 100×100 viewBox, maps values to points
- Blue-to-amber gradient stroke (`var(--accent)` → `var(--highlight)`)
- Used for inline sparklines in metric cards (currently not rendered in App.tsx but available)
- Empty state: "Waiting for more checkpoints"

### 4.10 `api.ts` — Data Layer
- `loadDashboardSnapshot()`: 5 concurrent `fetch` calls via `Promise.allSettled`, merges into `DashboardSnapshot`
- `stopAgent()`: POST to `/api/agent/stop`
- `loadMarketContext()`: GET `/api/market-context`
- Uses `API_BASE` from `import.meta.env.VITE_API_BASE_URL`
- Graceful: returns `null` for failed endpoints, `[]` for failed arrays

---

## 5 · CURRENT VISUAL DESIGN TOKENS

```css
:root {
  --bg: #0A0A0B;                    /* Near-black base */
  --bg-elevated: #151518;           /* Elevated surfaces */
  --bg-card: rgba(28, 28, 31, 0.7); /* Glass card background */
  --border: rgba(255, 255, 255, 0.08);
  --text: #F3F4F6;                  /* Primary text */
  --muted: #9CA3AF;                 /* Secondary text */
  --accent: #0070F3;                /* Electric blue */
  --highlight: #F5A623;             /* Amber gold */
  --good: #10B981;                  /* Emerald green */
  --warn: #F5A623;                  /* Amber warning */
  --bad: #EF4444;                   /* Red danger */
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

### Typography
- **Headings (h1)**: 3.5rem, weight 800, gradient text (white → gray), tight letter-spacing
- **Eyebrow labels**: 0.75rem JetBrains Mono, uppercase, `letter-spacing: 0.15em`, accent color
- **Body**: Inter 1.125rem, line-height 1.6
- **Data values**: 2rem weight 700 (metric cards), up to 4.5rem for price display
- **Monospace data**: JetBrains Mono for all technical values

### Animation
- **Mesh gradient**: 4 radial gradients animate position over 20s (blue, purple, green, amber spots)
- **Perspective grid**: 3D-transformed grid lines scroll upward over 10s, masked radially
- **Card hover**: `translateY(-2px)` + shadow increase over 200ms
- **Feed item hover**: `translateY(-2px)` + background brighten + shadow
- **Macro strip**: Pulse animation on `box-shadow` over 10s

---

## 6 · REDESIGN VISION: "MISSION CONTROL"

### 6.1 Design Philosophy

Transform this from a **dashboard** into a **mission control center** — the kind of interface you'd see at a quant fund's trading desk or NASA's ground control. Every pixel should communicate: **precision, authority, control**.

**Keywords**: Cinematic dark UI · Data-dense but breathable · Operator-grade · Real-time presence · Terminal aesthetics meets premium SaaS

### 6.2 Layout Overhaul

#### Proposed Layout (Bloomberg Terminal meets Linear.app)

```
┌───────────────────────────────────────────────────────────────────┐
│  TOP BAR: Logo · Agent selector · Connection status · Timestamp  │
├──────────┬──────────────────────────────────────────────┬────────┤
│          │                                              │        │
│  LEFT    │              MAIN CANVAS                     │ RIGHT  │
│  RAIL    │                                              │ RAIL   │
│          │  ┌──────────────────────────────────────┐   │        │
│  Agent   │  │     EQUITY CURVE / PRICE CHART       │   │ Risk   │
│  Status  │  │     (full-width, taller, candles?)   │   │ Panel  │
│  Panel   │  │     with trade markers overlay        │   │        │
│          │  └──────────────────────────────────────┘   │ CPPI   │
│  Quick   │                                              │ Gauge  │
│  Metrics │  ┌────────────┐ ┌──────────┐ ┌──────────┐  │        │
│  (mini   │  │ Composite  │ │  Net PnL │ │ Drawdown │  │ Circuit│
│  cards)  │  │  Score     │ │          │ │          │  │ Breaker│
│          │  └────────────┘ └──────────┘ └──────────┘  │ Status │
│  Feed    │                                              │        │
│  Mode    │  ┌─────────────────────┬───────────────────┐│ Valid. │
│  Toggle  │  │  CHECKPOINT FEED    │  TRACE FEED       ││ Proofs │
│          │  │  (expanded)         │  (expanded)       ││        │
│          │  │                     │                    ││ Recent │
│          │  └─────────────────────┴───────────────────┘│ Txns   │
│          │                                              │        │
├──────────┴──────────────────────────────────────────────┴────────┤
│  FOOTER: Agent ID · Market mode · Drawdown · Latency · Version  │
└───────────────────────────────────────────────────────────────────┘
```

#### Key Layout Changes
1. **Three-column layout** with collapsible side rails (280px left, flexible center, 300px right)
2. **Left rail**: Agent identity, compact status, quick metrics in a sidebar format
3. **Right rail**: Risk panel (CPPI gauge, circuit breaker, drawdown meter), validation proofs, recent on-chain txns
4. **Center**: Full-width equity chart (taller — 400-450px), metric row, and dual feeds
5. **Top bar**: Persistent navigation bar with agent selector, connection heartbeat indicator, clock
6. **Collapsible panels**: Side rails can collapse to icons for more chart space

### 6.3 Component Redesigns

#### 6.3.1 Top Navigation Bar (NEW)
- **Left**: FluxAgent logo mark (animated glow) + agent name dropdown
- **Center**: Connection heartbeat (animated dot: green = live, amber = degraded, red = disconnected) with latency display
- **Right**: Current time (monospace, updating every second), market regime indicator, settings gear icon
- **Background**: `rgba(10, 10, 11, 0.95)` with bottom border glow matching accent
- **Height**: 56px fixed

#### 6.3.2 Equity Chart → TradingView-Grade Chart
**Current**: Basic Recharts AreaChart with dots. **Upgrade to**:

- **Option A (Recommended)**: Integrate [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) — candlestick or line chart with:
  - Trade markers (BUY = green triangle up, SELL = red triangle down, HOLD = gray diamond)
  - Crosshair with price/time tooltip
  - Volume bars at bottom
  - Price scale on right, time scale on bottom
  - Zoom and pan
  - Grid lines matching the dark theme

- **Option B**: Upgrade Recharts with:
  - Custom tooltip with full trade details (pair, amount, confidence, model)
  - Animated line drawing on new data points
  - Gradient that changes color based on trend (green when up, red when down)
  - Grid lines at major price levels (round numbers)
  - Minimap/brush selector for time range

- **Height**: 400-450px (taller than current 350px)
- **Data**: Use `checkpoints` array, reverse chronological → chronological for chart rendering

#### 6.3.3 Metric Cards → Premium KPI Tiles
**Current**: Simple glass card with label/value/detail. **Upgrade to**:

- **Sparkline** in each card (use the existing `Sparkline` component!)
- **Trend arrow** (▲/▼) with percentage change
- **Micro-animation**: Number count-up effect when values change (use `framer-motion`'s `animate` or `react-countup`)
- **Subtle glow** under the value matching the tone color
- **Progress ring** or **mini bar** for composite score (showing position out of 100)
- **Layout**: Horizontal metric row, 4 cards, each ~250px wide

Specific card upgrades:
| Card | Upgrade |
|------|---------|
| **Composite Score** | Circular progress ring (0-100), number in center, sparkline below, breakdown sub-scores as mini bars |
| **Net PnL** | Large signed USD value, sparkline of recent PnL trajectory, realized vs unrealized as stacked mini bar |
| **Drawdown** | Gauge meter (0-2000 bps range), current vs limit markers, color gradient green→amber→red |
| **Reputation** | Star rating visual (1-5 stars mapped from score), feedback count badge, latest feedback type chip |

#### 6.3.4 Status Chips → Command Bar
**Current**: Simple flex-wrap chips. **Upgrade to**:

- **Inline command bar** at the top of the left rail
- Each status item as a labeled key-value pair with icon
- **Running status**: Animated pulsing dot (green pulse when running, static red when stopped)
- **Drawdown**: Mini progress bar showing current vs max
- **Mode badges**: Colored pills with subtle animated borders

#### 6.3.5 Market Context → Ticker Tape
**Current**: Static horizontal strip. **Upgrade to**:

- **Scrolling ticker tape** animation (like Bloomberg/financial TV) for the macro data
- OR keep static but with **animated value changes** (flash green/red when values update)
- Add **mini sparklines** next to each value if historical data is available
- **Fear & Greed**: Replace text with a **semicircular gauge** (0-100, color gradient from red through yellow to green)
- **Gas**: Animated flame icon that scales with gas price

#### 6.3.6 Checkpoint Feed → Trade Log Terminal
**Current**: Vertical card list. **Upgrade to**:

- **Terminal-style log** with monospace font and syntax highlighting:
  ```
  [14:32:08] BUY  ETH/USD @ $1,842.56 | conf: 0.87 | +$12.40
            ↳ "Strong momentum breakout above 200 SMA..."
  [14:28:41] HOLD ETH/USD @ $1,839.12 | conf: 0.62 |
            ↳ "Waiting for confirmation of support level..."
  ```
- **Color-coded action prefix**: BUY in green, SELL in red, HOLD in amber
- **Expandable rows**: Click to reveal full reasoning text with animation
- **Profit/loss badge**: Show PnL for each completed trade (BUY→SELL pair)
- **Filter bar**: Filter by action type (BUY/SELL/HOLD), confidence threshold, time range
- **New entry animation**: Slide in from left with subtle flash
- **Maximum items**: Show last 20 (up from 6), with virtual scrolling

#### 6.3.7 Trace Feed → LLM Reasoning Inspector
**Current**: Vertical card list. **Upgrade to**:

- **Structured reasoning cards** with:
  - Model avatar/icon (OpenAI logo, Anthropic logo, etc.)
  - Confidence bar (horizontal, color-coded)
  - Collapsible reasoning section (expand/collapse with chevron)
  - Fallback indicator as a warning banner
  - Token usage estimate (if available)
- **Side-by-side comparison**: When dual models disagree, show both side-by-side in a diff view
- **Decision tree**: Mini flowchart showing the reasoning chain
- **Filter**: By model, by decision, by fallback status

#### 6.3.8 Validation Proofs → On-Chain Verification Panel
**Current**: Simple table. **Upgrade to**:

- **Visual proof chain**: Each proof as a block in a chain visualization
- **Score gauge**: Circular gauge for each proof's score
- **Expandable row**: Click to see full hash, transaction link, validator details
- **Status indicators**: Animated checkmark for verified, spinning for pending, X for failed
- **Etherscan deep link** with proper button styling
- **Timestamp**: Relative time ("2m ago", "5m ago") with tooltip showing exact time

#### 6.3.9 Risk Panel (NEW — Right Rail)
Visualize all the `DashboardRiskStatus` data that's currently hidden:

- **CPPI Gauge**: Semicircular gauge showing:
  - Floor equity (bottom marker)
  - Current equity (needle)
  - Cushion ratio (colored zone)
  - Scale factor (position size multiplier)

- **Drawdown Meter**: Vertical bar:
  - Current drawdown level (fill color: green → amber → red)
  - Max drawdown limit (dashed line at top)
  - Numeric readout: "234 bps / 1000 bps limit"

- **Circuit Breaker Status**:
  - Large status indicator: ACTIVE (red, pulsing) or INACTIVE (green, static)
  - If active: reason text, consecutive losses, daily loss amount
  - If inactive: "Markets nominal" with green check

- **Volatility Throttle**:
  - Mini gauge showing current volatility %
  - Trade scale indicator: "Position scaling: 0.65x"

#### 6.3.10 Readiness Status Panel (NEW)
Visualize `DashboardReadinessStatus`:

- **Gate checklist**: Each gate as a row with pass/fail indicator
  - Evidence Depth: ✓ 42 checkpoints (10-100 required)
  - Run Quality: ✓ Net PnL +$12.40, Max DD 234 bps
  - All Checks: ✓ PASSED
- **Submission readiness badge**: Large "READY FOR SUBMISSION" or "X GATES REMAINING"
- **Animated**: Green checkmark animation when all gates pass

### 6.4 Micro-Interactions & Animation

#### Number Transitions
- **Counting animation**: When metrics update, numbers should count up/down smoothly
- **Color flash**: Values flash briefly (green glow for positive changes, red for negative)
- **Implementation**: `framer-motion` `animate` with spring physics, or CSS `@property` + `transition`

#### Data Loading States
- **Skeleton shimmer**: Replace "Waiting for data..." with animated skeleton cards
- **Progressive reveal**: Components fade in as their data arrives
- **Skeleton shapes match content**: Chart skeleton is a wavy line, metric skeletons are rounded rectangles

#### Connection Status
- **Heartbeat pulse**: Small dot that pulses every 4 seconds when data arrives successfully
- **Latency display**: Show "42ms" next to heartbeat, flash if > 500ms
- **Reconnection**: Animated spinner when connection is lost, auto-retry indicator

#### New Data Arrival
- **Feed items**: Slide in from top with subtle blue left-border flash
- **Chart**: New point animates in with a small burst effect
- **Price change**: Number slides in direction of change (up = slide up, down = slide down)
- **Sound option**: Subtle tick sound on new trade (user toggle)

### 6.5 Typography System

```
Display/Hero:   Inter, 800 weight, -0.04em tracking
H1 Section:     Inter, 700 weight, 2rem
H2 Panel Title: JetBrains Mono, 600 weight, 0.875rem, uppercase, 0.1em tracking
Body:           Inter, 400 weight, 0.95rem, line-height 1.6
Data Value:     JetBrains Mono, 700 weight, variable size
Data Label:     JetBrains Mono, 400 weight, 0.72rem, uppercase, 0.15em tracking
Timestamp:      JetBrains Mono, 400 weight, 0.8rem, muted color
```

### 6.6 Color System (Extended)

```
/* Base */
--bg-primary:      #08080A      /* Deeper black */
--bg-secondary:    #111114      /* Panel backgrounds */
--bg-elevated:     #1A1A1F      /* Cards, popovers */
--bg-hover:        #222228      /* Hover states */

/* Semantic */
--accent:          #2563EB      /* Slightly richer blue */
--accent-soft:     rgba(37, 99, 235, 0.12)
--success:         #10B981      /* Green */
--success-soft:    rgba(16, 185, 129, 0.12)
--warning:         #F59E0B      /* Amber */
--warning-soft:    rgba(245, 158, 11, 0.12)
--danger:          #EF4444      /* Red */
--danger-soft:     rgba(239, 68, 68, 0.12)

/* Text */
--text-primary:    #F9FAFB
--text-secondary:  #9CA3AF
--text-tertiary:   #6B7280

/* Special */
--glow-accent:     0 0 20px rgba(37, 99, 235, 0.3)
--glow-success:    0 0 20px rgba(16, 185, 129, 0.3)
--glow-danger:     0 0 20px rgba(239, 68, 68, 0.3)
```

### 6.7 Responsive Strategy

- **≥1440px**: Full three-column layout with side rails
- **1024-1439px**: Two columns (left rail collapses into top bar), right rail becomes bottom drawer
- **768-1023px**: Single column, all panels stack vertically, chart takes full width
- **<768px**: Mobile-optimized: stacked cards, swipeable feeds, collapsible sections

### 6.8 Performance Targets

- **First Contentful Paint**: < 800ms
- **Time to Interactive**: < 1.2s
- **Animation frame rate**: Consistent 60fps (no layout thrashing on data updates)
- **Bundle size**: < 200KB gzipped (tree-shake unused Recharts components or switch to Lightweight Charts)
- **Memory**: No memory leaks from polling (proper cleanup in useEffect returns)

---

## 7 · IMPLEMENTATION PRIORITIES

### Phase 1: Foundation (Day 1-2)
1. Set up Tailwind CSS or design token system
2. Implement three-column layout with collapsible side rails
3. Add top navigation bar with connection status
4. Migrate all existing components to new layout
5. Set up TanStack Query for data fetching

### Phase 2: Visual Upgrade (Day 3-4)
1. Redesign metric cards with sparklines and animations
2. Upgrade equity chart (TradingView Lightweight Charts integration)
3. Implement risk panel in right rail (CPPI gauge, circuit breaker, drawdown meter)
4. Add number count-up animations and color flash effects
5. Implement skeleton loading states

### Phase 3: Interaction (Day 5-6)
1. Redesign checkpoint feed as terminal-style log
2. Redesign trace feed as reasoning inspector
3. Add filter bars to both feeds
4. Implement validation proofs visual chain
5. Add readiness status panel

### Phase 4: Polish (Day 7)
1. Add all micro-interactions (hover states, transitions, entry animations)
2. Implement responsive breakpoints
3. Performance optimization (React.memo, useMemo for expensive computations)
4. Dark mode only but ensure WCAG 2.1 AA contrast ratios
5. Final QA across browsers

---

## 8 · FILES TO MODIFY/CREATE

### Existing Files (Modify)
| File | Changes |
|------|---------|
| `ui/src/App.tsx` | Restructure layout to three-column, add top bar, integrate new panels |
| `ui/src/styles.css` | Extend with new design tokens, three-column grid, new component styles |
| `ui/src/components/MetricCard.tsx` | Add sparkline, trend arrow, count-up animation, progress ring |
| `ui/src/components/StatusChips.tsx` | Redesign as compact sidebar status panel |
| `ui/src/components/EquityChart.tsx` | Replace Recharts with TradingView Lightweight Charts or major Recharts upgrade |
| `ui/src/components/CheckpointFeed.tsx` | Terminal-style log, expandable rows, filters, 20 items |
| `ui/src/components/TraceFeed.tsx` | Reasoning inspector with model icons, confidence bars |
| `ui/src/components/ValidationProofs.tsx` | Visual proof chain, score gauges |
| `ui/src/components/MarketContext.tsx` | Ticker tape or animated value changes, Fear&Greed gauge |
| `ui/src/lib/api.ts` | Add TanStack Query hooks, keep existing functions for compatibility |

### New Files (Create)
| File | Purpose |
|------|---------|
| `ui/src/components/TopBar.tsx` | Navigation bar with agent selector, heartbeat, clock |
| `ui/src/components/RiskPanel.tsx` | CPPI gauge, drawdown meter, circuit breaker, volatility throttle |
| `ui/src/components/ReadinessPanel.tsx` | Submission gate checklist with pass/fail indicators |
| `ui/src/components/CircularGauge.tsx` | Reusable SVG circular gauge component |
| `ui/src/components/SemiCircleGauge.tsx` | Reusable SVG semicircle gauge for CPPI, Fear&Greed |
| `ui/src/components/DrawdownMeter.tsx` | Vertical drawdown bar with limit marker |
| `ui/src/components/SkeletonCard.tsx` | Animated skeleton loading placeholder |
| `ui/src/components/NumberFlow.tsx` | Animated number component (count-up/down with color flash) |
| `ui/src/hooks/useDashboardData.ts` | TanStack Query hooks for all dashboard endpoints |
| `ui/src/hooks/useConnectionStatus.ts` | Connection health monitoring hook |

---

## 9 · REFERENCE INSPIRATION

Study these for visual direction:
- **Bloomberg Terminal** — Data density, information hierarchy, dark theme
- **Linear.app** — Clean modern dark UI, subtle animations, excellent typography
- **Vercel Dashboard** — Minimalist dark, beautiful charts, status indicators
- **Raycast** — Command palette UX, keyboard-first, beautiful dark theme
- **TradingView** — Chart quality, trade markers, crosshair tooltips
- **Stripe Dashboard** — Metric cards, sparklines, premium feel
- **Notion** — Clean panels, expandable sections, loading states
- **Arc Browser** — Sidebar navigation, tab management, modern aesthetics

---

## 10 · TECHNICAL CONSTRAINTS

1. **No backend changes required** — all API endpoints remain the same
2. **4-second polling interval** must be respected (backend limitation)
3. **React 19 + Vite** — must stay on this stack
4. **All data is read-only** except the Stop Agent button
5. **Dark theme only** — no light mode needed
6. **Single agent** — no multi-agent switching needed (yet)
7. **Mobile is secondary** — desktop-first design, mobile responsive as bonus
8. **No authentication** — dashboard is open/local
9. **Build output**: Static SPA served from `ui/dist/`

---

## 11 · ACCEPTANCE CRITERIA

The redesign is complete when:
- [ ] Every data field from the API contracts is visualized somewhere
- [ ] The CPPI gauge, circuit breaker, and drawdown meter are prominently displayed
- [ ] The equity chart supports zoom/pan or is TradingView-quality
- [ ] Feed items animate in when new data arrives
- [ ] Numbers animate smoothly when values change
- [ ] Skeleton states exist for every panel
- [ ] Connection status is always visible
- [ ] The Stop Agent button is accessible but not prominent (de-emphasized)
- [ ] All on-chain data (proofs, hashes, validator links) is beautifully presented
- [ ] The overall impression is "this could win a hackathon design award"

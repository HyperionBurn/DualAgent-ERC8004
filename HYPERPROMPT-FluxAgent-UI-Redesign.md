# 🏆 HYPERPROMPT — FluxAgent Award-Winning Landing Page Redesign

## ⚡ TL;DR for the UI Creator

You are redesigning **FluxAgent**, the world's first ERC-8004 compliant autonomous trading agent. This is a hackathon-winning landing page that must scream **institutional trust**, **cryptographic verifiability**, and **cutting-edge AI**. Think Bloomberg Terminal meets Apple Keynote meets a blockchain explorer. Dark, cinematic, data-rich, and dripping with credibility.

---

## 📐 PROJECT CONTEXT

### What Is FluxAgent?
An autonomous AI trading system deployed on Ethereum Sepolia testnet where:
- Every trading decision is **cryptographically signed** (EIP-712)
- Every risk limit is **enforced by smart contracts** (RiskRouter.sol)
- Every agent has an **on-chain identity passport** (ERC-721 NFT)
- Reputation is **portable across protocols** (ReputationRegistry.sol)
- The tagline is: **"Identity is the New Alpha"**

### Brand Identity
- **Name**: FluxAgent
- **Vibe**: Dark obsidian, electric cyan (#00d4ff), neon green (#00ff88), institutional trust, cyberpunk-finance
- **Tagline**: "Identity is the New Alpha"
- **Secondary**: "The first ERC-8004 compliant agent with signature-level traceability and on-chain risk enforcement. Every decision is cryptographically bound, every trade is verifiable."

### Competition Context
- Ethereum Foundation Hackathon submission
- Must impress both **technical judges** (who will audit the code/evidence) and **general audience** (who need to "get it" in 10 seconds)
- Dual-agent architecture: Agent 5 (primary, composite score 78.78) and Agent 53 (secondary, composite score 76.98)

---

## 🎨 CURRENT TECH STACK (DO NOT CHANGE)

```
Framework:    Next.js 16.2 (App Router)
Language:     TypeScript / React 19
Styling:      Tailwind CSS v4 + custom CSS variables
Components:   shadcn/ui (Radix primitives + CVA)
Animation:    Framer Motion 12
Charts:       Recharts 2.15
Icons:        Lucide React
Fonts:        Inter (sans) + Geist Mono (mono)
Deployment:   Vercel (with Analytics)
```

### Current Theme System (CSS Variables)
```css
--background: #000000           /* Pure black */
--foreground: #e5e5e5           /* Light gray text */
--card: #050505                 /* Near-black cards */
--primary: #00d4ff              /* Electric cyan - primary brand color */
--secondary: #1a1a2e            /* Deep indigo */
--muted: #0f0f0f                /* Subtle backgrounds */
--muted-foreground: #737373     /* Dimmed text */
--accent: #00d4ff               /* Same as primary */
--destructive: #ff4757          /* Red for errors/danger */
--success: #00ff88              /* Neon green for positive states */
--border: rgba(255,255,255,0.08) /* Subtle white borders */
--ring: #00d4ff                 /* Focus rings */
--chart-1: #00d4ff              /* Cyan */
--chart-2: #00ff88              /* Green */
--chart-3: #6366f1              /* Indigo */
--chart-4: #8b5cf6              /* Purple */
--chart-5: #ec4899              /* Pink */
--radius: 0.75rem               /* Rounded corners */
```

---

## 🗺️ CURRENT PAGE STRUCTURE (7 Sections)

```
1. Navigation     → Fixed top nav with frosted glass
2. Hero           → "Identity is the New Alpha" headline
3. AlphaVectors   → 4 feature cards (2x2 grid)
4. ERC8004Trinity → 3 tabbed registries with code previews
5. EvidencePipeline → 4-step vertical timeline
6. ScoreStory     → Metric bento grid with animated numbers
7. Verdict        → JSON manifest + verification checklist
8. Footer         → Links + branding
```

---

## 🔍 CURRENT SECTION-BY-SECTION BREAKDOWN + UPGRADE BRIEF

### 1. NAVIGATION (current: `navigation.tsx`)

**Current State:**
- Fixed top, frosted glass pill (`bg-card/60 backdrop-blur-xl`)
- Left: FluxAgent logo (Zap icon + text)
- Center: 4 nav links (Protocol, Evidence, Metrics, Audit)
- Right: "View on Etherscan" button
- Entry animation: slide down with spring easing

**Upgrade To:**
- **Morphing navbar**: Transparent on hero → frosted glass after scroll (use `useScroll` from Framer Motion)
- **Active section indicator**: Dot or underline that follows scroll position
- **Live status pill**: Add a tiny real-time status indicator near the logo: `<green-dot> Agent 5: Live` with a subtle pulse
- **Mobile drawer**: Slide-in drawer for mobile nav (currently just hides links on mobile)
- **Micro-interaction**: Logo icon should have a subtle electric glow animation on hover
- Keep the Etherscan link but also add a GitHub icon button

---

### 2. HERO (current: `hero.tsx`)

**Current State:**
- Full-viewport section with gradient orbs + grid pattern background
- Badge: "Ethereum Foundation Hackathon Submission" with green pulse dot
- Headline: "Identity is the **New Alpha**" (8xl font, "New Alpha" in cyan with animated underline)
- Subheadline: Description paragraph
- 3 CTAs: "Explore Protocol" (primary), "View Evidence" (outline), "Source Code" (ghost)
- 3 trust indicator cards: ERC-8004 Compliant, RiskRouter Enforced, EIP-712 Signed
- Scroll indicator at bottom

**Upgrade To:**
- **Particle field background**: Replace static gradient orbs with an animated particle/node network (think Three.js or Canvas-based constellation effect) that subtly responds to mouse movement. Fallback: animated SVG noise pattern.
- **Typewriter or split-text reveal**: Instead of simple fade-in, use character-by-character staggered reveal for the headline with a slight bounce
- **Animated counter badges**: The trust indicator cards should show LIVE numbers:
  - "60 Checkpoints Signed" with the number counting up
  - "15 Trades Attested" counting up
  - "78.78 Composite Score" counting up
- **Glowing border cards**: The trust indicator cards should have a subtle animated gradient border (rainbow or cyan pulse) on hover
- **Hero stat ribbon**: Below the CTAs, add a horizontal ribbon of 4 key stats in a single row:
  ```
  $10,000.47 Equity  |  +$0.47 PnL  |  2 bps Max DD  |  99/100 Validation
  ```
  Each stat should have a micro sparkline or trend arrow
- **3D tilt effect**: On mouse move, the hero content should have a subtle 3D parallax tilt (CSS `perspective` + `rotateX/Y`)
- **Video background option**: Consider an option for a looping dark abstract video background (grid lines, data flowing, like a cyberpunk Bloomberg)

---

### 3. ALPHA VECTORS (current: `alpha-vectors.tsx`)

**Current State:**
- Section header: "The Alpha Vectors" with subtitle
- 2x2 grid of feature cards, each with:
  - Colored icon (BrainCircuit, Network, Binary, Activity)
  - Title + description
  - Gradient hover overlay
- Features: Dual-LLM Consensus, Asymmetric Data Integration, Immutable Smart Contract Guardrails, Portable Reputation State

**Upgrade To:**
- **Bento grid layout** instead of uniform 2x2: Make the first card span 2 columns, vary heights
- **Animated diagram inside each card**: Instead of just text, embed a small animated visualization:
  - Card 1 (Dual-LLM): Two converging signal lines merging into one → "CONSENSUS" flash
  - Card 2 (Asymmetric Data): Orbiting data nodes around a central brain
  - Card 3 (Smart Contract Guardrails): A lock icon with force-field animation
  - Card 4 (Reputation): Growing graph/chart animation
- **Glass morphism cards with noise texture**: Add SVG noise overlay for depth
- **Hover state**: Card lifts up (translateY -4px), border glows with card's theme color, background gradient intensifies
- **Feature numbering**: Add step numbers "01", "02", "03", "04" in large monospace text in card background

---

### 4. ERC-8004 TRINITY (current: `erc8004-trinity.tsx`)

**Current State:**
- 3 tab buttons (Identity, Reputation, Validation)
- Active tab shows: description card + Solidity code preview
- Each registry has: icon, title, subtitle, description, feature list, code snippet
- Code preview has a dark code block with syntax highlighting

**Upgrade To:**
- **3D carousel or orbital selector**: Instead of flat tabs, create an interactive 3D orbiting selector where the 3 registries orbit a central node, and clicking one brings it to front
- **Live contract interaction**: For each registry, show the ACTUAL Sepolia contract address with a verified badge, and a "View on Etherscan" link that opens the real contract:
  ```
  AgentRegistry:       0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3 ✅ Verified
  ReputationRegistry:  0x423a9904e39537a9997fbaF0f220d79D7d545763 ✅ Verified
  ValidationRegistry:  0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE ✅ Verified
  ```
- **Terminal-style code preview**: Replace plain code block with a realistic terminal window:
  - Dark background with green/cyan text
  - Blinking cursor
  - Line numbers
  - Copy button
  - Subtle scan-line effect
- **Interactive architecture diagram**: Show the 3 registries connected to the agent in a small animated diagram that updates based on selected tab
- **Connecting lines animation**: Animated dashed lines connecting the three registries to show data flow

---

### 5. EVIDENCE PIPELINE (current: `evidence-pipeline.tsx`)

**Current State:**
- 4 vertical timeline steps: LLM Reasoning → EIP-712 Signing → RiskRouter Validation → On-Chain Attestation
- Alternating left/right layout on desktop
- Each step has: icon, title, status badge, description, technical flow
- Center line with step numbers
- Bottom card: "Deterministic Evidence Output" callout

**Upgrade To:**
- **Animated data flow visualization**: Instead of a static timeline, create an animated flow where "particles" (tiny glowing dots) travel down the pipeline:
  - Step 1: Particles emerge (LLM reasoning generates data)
  - Step 2: Particles pass through a "signing gate" (they change color from gray to cyan)
  - Step 3: Some particles get blocked (red flash, rejected by RiskRouter)
  - Step 4: Surviving particles reach the "chain" and get a permanent glow
- **Real evidence artifact previews**: Instead of just descriptions, show actual snippets from the evidence files:
  ```
  checkpoints.jsonl → Last entry: { action: "HOLD", confidence: 0.95, signed: true }
  fills.jsonl → Last fill: { pair: "XBTUSD", amount: 25.00, status: "approved" }
  ```
- **Risk rejection animation**: A dramatic red flash/card when a trade is rejected by the RiskRouter, showing the rejection reason
- **Progress bar between steps**: Animated progress indicator showing how many checkpoints have passed through each stage
- **Live counter**: "60/60 checkpoints processed • 15/15 fills executed • 0 rejections"

---

### 6. SCORE STORY (current: `score-story.tsx`)

**Current State:**
- Bento grid of metric cards:
  - Large PnL card with animated bar chart (2 cols)
  - Max Drawdown gauge card
  - Proof Coverage percentage
  - 3 secondary metrics: Checkpoints, Validation Score, Reputation Score
- Animated number counters
- Mini bar chart visualization in PnL card

**Upgrade To:**
- **REAL interactive charts using Recharts**: Replace the static CSS bar chart with:
  - **Equity curve**: A proper line chart showing equity over time (ascending from $10,000 to $10,000.47)
  - **Drawdown gauge**: A proper radial/gauge chart instead of a CSS bar
  - **Donut chart**: For the 4-factor composite score breakdown:
    ```
    Risk-Adjusted Profitability: 50.09/100 → shown as segment
    Drawdown Control:            99.96/100 → shown as segment
    Validation Quality:          99.00/100 → shown as segment
    Objective Reputation:        93.00/100 → shown as segment
    Composite Score:             78.78     → center number
    ```
- **Dual-agent comparison table**: Show Agent 5 vs Agent 53 side by side:
  | Metric | Agent 5 🟢 | Agent 53 🔵 |
  | Validation | 99.00 | 92.23 |
  | Reputation | 93.00 | 90.00 |
  | Composite | 78.78 | 76.98 |
  | Checkpoints | 60 | 53 |
  | Fills | 15 | 15 |
  | Max DD | 2 bps | 0 bps |
  | Net PnL | +$0.47 | +$0.44 |
- **Animated score ring**: The composite score should be shown as an animated ring/arc that fills from 0 to 78.78
- **Sparklines**: Each metric card should have a tiny sparkline showing the trend
- **Tooltip interactions**: Hover over any metric to see the exact value, timestamp, and source

**Exact Metric Values to Display (from metrics.json):**
```
Composite Score:      78.78
Net PnL:             +$0.47
Max Drawdown:          2 bps (limit: 5000 bps)
Current Equity:    $10,000.47
Peak Equity:       $10,001.37
Validation Score:     99.00
Reputation Score:     93.00
Checkpoints:          60
Fills:                15
Reputation Feedback:  73
Proof Coverage:      100%
Drawdown Headroom:  4,999 bps
```

**Composite Score Breakdown:**
```
Risk-Adjusted Profitability: 50.09
Drawdown Control:            99.96
Validation Quality:          99.00
Objective Reputation:        93.00
→ Composite = weighted average = 78.78
```

---

### 7. VERDICT (current: `verdict.tsx`)

**Current State:**
- 2-column layout:
  - Left: `submission-manifest.json` code block with copy/download buttons
  - Right: `phase2-evidence.json` verification checklist (6 items, all green checks)
- Each evidence item has a truncated hash

**Upgrade To:**
- **Full 12-gate verification dashboard**: Show ALL 12 phase-2 gates (not just 6):
  ```
  Gate 1:  Sepolia Proof Integrity           ✅ PASS
  Gate 2:  Capital Claim Proof                ✅ PASS
  Gate 3:  Registration Proof Completeness    ✅ PASS
  Gate 4:  Artifact Identity Integrity        ✅ PASS
  Gate 5:  Submission Asset Manifesting       ✅ PASS
  Gate 6:  Validation Evidence Coverage       ✅ PASS
  Gate 7:  Composite Score Output             ✅ PASS
  Gate 8:  Reputation Evidence                ✅ PASS
  Gate 9:  Evidence Depth                     ✅ PASS
  Gate 10: Run Quality                        ✅ PASS
  Gate 11: Router Enforcement                 ✅ PASS
  Gate 12: Drawdown Evidence                  ✅ PASS
  Result: 12/12 PASSED • 0 FAIL REASONS
  ```
- **Animated gate reveal**: Gates check off one by one with a satisfying animation (green check appears, card slides)
- **Submission manifest with LIVE data**: Pull from the actual `submission-manifest.json`:
  ```json
  {
    "links": {
      "githubRepository": "https://github.com/HyperionBurn/DualAgent-ERC8004",
      "demoUrl": "https://github.com/HyperionBurn/DualAgent-ERC8004",
      "videoUrl": ".../DETAILED_WALKTHROUGH.md",
      "slidesUrl": ".../ARCHITECTURE.md"
    },
    "evidence": {
      "sharedContracts": "shared-contracts.json",
      "capitalProof": "capital-proof.json",
      "registrationProof": "registration-proof.json",
      "metrics": "metrics.json",
      "equityReport": "equity-report.json",
      "reputationFeedback": "reputation-feedback.jsonl",
      "phase2Evidence": "phase2-evidence.json"
    },
    "readiness": {
      "hasAllRequiredLinks": true,
      "hasAllRequiredEvidence": true,
      "missingFields": [],
      "strictMode": true
    }
  }
  ```
- **Real Etherscan links**: Each contract address should be a clickable link to Sepolia Etherscan:
  - AgentRegistry: `https://sepolia.etherscan.io/address/0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3`
  - HackathonVault: `https://sepolia.etherscan.io/address/0x0E7CD8ef9743FEcf94f9103033a044caBD45fC90`
  - RiskRouter: `https://sepolia.etherscan.io/address/0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC`
  - ReputationRegistry: `https://sepolia.etherscan.io/address/0x423a9904e39537a9997fbaF0f220d79D7d545763`
  - ValidationRegistry: `https://sepolia.etherscan.io/address/0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE`
- **Confetti/celebration animation**: When all 12 gates pass, trigger a subtle confetti or particle burst
- **Final CTA**: Large, prominent call-to-action:
  ```
  ✅ READY FOR SUBMISSION
  All 12 verification gates passed. Zero fail reasons.
  [View on GitHub]  [Verify on Etherscan]
  ```

---

### 8. FOOTER (current: `footer.tsx`)

**Current State:**
- 4-column grid: Brand + description, Protocol links, Resources
- Bottom bar: Copyright + GitHub + ERC-8004 spec links
- External link icons

**Upgrade To:**
- **Animated chain link**: A subtle animation showing blocks being added to a chain
- **Contract address bar**: Show all 5 contract addresses in a monospace bar
- **"Built with" tech logos**: Show icons for Ethereum, Next.js, Hardhat, Groq, etc.
- **Social proof**: "Submitted to Ethereum Foundation Hackathon 2026"

---

## ✨ GLOBAL UPGRADES (Apply Across All Sections)

### Animation System
- **Staggered reveal**: Every section's children should animate in with staggered delays (0.05-0.1s between items)
- **Parallax**: Background elements should move at different speeds on scroll
- **Page load sequence**: Hero loads first (0-1s), then each section fades in as user scrolls
- **Micro-interactions**: Every button, card, and link should have hover/press states with scale, color, and shadow transitions
- **Reduced motion**: All animations must respect `prefers-reduced-motion`

### Typography
- **Headlines**: Inter, font-weight 600-700, tracking-tight
- **Body**: Inter, font-weight 400-500
- **Code/Data**: Geist Mono for all contract addresses, hashes, and technical content
- **Numbers**: Use `tabular-nums` for all metric values
- **Sizes**: Follow the current scale (text-5xl to 8xl for hero, 4xl-5xl for sections, sm for labels)

### Visual Effects
- **Gradient mesh backgrounds**: Replace simple radial gradients with animated gradient meshes
- **Grid overlay**: Keep the subtle grid pattern but make it parallax
- **Glow effects**: Primary elements should have a subtle outer glow (`box-shadow` with `--primary`)
- **Noise texture**: Add SVG noise overlay to cards for depth
- **Scan lines**: Optional subtle CRT scan-line effect on code blocks for a hacker aesthetic
- **Cursor glow**: Optional: a subtle radial glow that follows the mouse cursor across the page

### Color Rules
- **Primary actions**: Cyan (#00d4ff)
- **Success/positive**: Neon green (#00ff88)
- **Danger/negative**: Red (#ff4757)
- **Indigo/purple**: For secondary highlights (#6366f1, #8b5cf6)
- **Pink**: For accent variety (#ec4899)
- **Text hierarchy**: #e5e5e5 → #737373 → rgba(255,255,255,0.5)
- **Background layers**: #000000 → #050505 → #0a0a0a → #0f0f0f

---

## 📊 REAL DATA TO EMBED

### Agent 5 (Primary) — metrics.json
```json
{
  "agentId": "5",
  "netPnlUsd": 0.47,
  "maxDrawdownBps": 2,
  "currentEquityUsd": 10000.47,
  "peakEquityUsd": 10001.37,
  "averageValidationScore": 99,
  "averageReputationScore": 93,
  "compositeScore": 78.78,
  "checkpointCount": 60,
  "fillCount": 15,
  "reputationFeedbackCount": 73,
  "validationCoveragePct": 100,
  "riskAdjustedProfitabilityScore": 50.09,
  "drawdownControlScore": 99.96,
  "validationQualityScore": 99,
  "objectiveReputationScore": 93,
  "recentFlow": "HOLD -> HOLD -> HOLD -> HOLD -> BUY"
}
```

### Agent 53 (Secondary) — from phase2-evidence
```json
{
  "agentId": "53",
  "validationScore": 92.23,
  "reputationScore": 90,
  "compositeScore": 76.98,
  "checkpoints": 53,
  "fills": 15,
  "maxDrawdownBps": 0,
  "netPnlUsd": 0.44
}
```

### Smart Contract Addresses (Sepolia)
```json
{
  "agentRegistry": "0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3",
  "hackathonVault": "0x0E7CD8ef9743FEcf94f9103033a044caBD45fC90",
  "riskRouter": "0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC",
  "reputationRegistry": "0x423a9904e39537a9997fbaF0f220d79D7d545763",
  "validationRegistry": "0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE"
}
```

### 12 Phase-2 Verification Gates (ALL PASS)
```
1.  strictSepoliaProofIntegrity    ✅ Shared Sepolia contracts snapshotted with live bytecode checks
2.  capitalClaimProof              ✅ Capital claim proof includes Sepolia tx hash
3.  registrationProofCompleteness  ✅ Registration proof includes matching Sepolia identity
4.  artifactIdentityIntegrity      ✅ All runtime artifacts belong to configured agent
5.  submissionAssetManifesting     ✅ Submission manifest includes all required links/evidence
6.  validationEvidenceCoverage     ✅ Checkpoints backed by validation evidence >= 70% coverage
7.  compositeScoreOutput           ✅ metrics.json contains coherent score story
8.  reputationEvidence             ✅ Objective reputation present >= 90 score, >= 6 feedback, >= 3 raters
9.  evidenceDepth                  ✅ Checkpoint/fill depth within target ranges (30-60 / 5-15)
10. runQuality                     ✅ Run quality satisfied (PnL > 0.01, drawdown <= 500bps)
11. routerEnforcement              ✅ Shared router enforcement proof with nonce/trade records
12. drawdownEvidence               ✅ Local equity and drawdown evidence present and fresh
```

### Solidity Code Snippets (for Trinity section)

**AgentRegistry.sol:**
```solidity
struct AgentPassport {
  address operator;
  bytes32 modelHash;
  uint256 deployedAt;
  bool isActive;
}
```

**ReputationRegistry.sol:**
```solidity
mapping(uint256 => ReputationScore) scores;

struct ReputationScore {
  uint256 successRate;
  uint256 totalTrades;
  int256 cumulativePnL;
  uint256 lastUpdate;
}
```

**ValidationRegistry.sol:**
```solidity
bytes32 constant TRADE_TYPEHASH = keccak256(
  "TradeIntent(bytes32 reasoningHash,"
  "address token,uint256 amount,"
  "uint256 deadline,uint256 nonce)"
);
```

---

## 🏗️ FILE STRUCTURE (current, maintain this)

```
Landingpage/
├── app/
│   ├── globals.css          ← Theme system (CSS variables)
│   ├── layout.tsx           ← Root layout with fonts + analytics
│   └── page.tsx             ← Main page composing all sections
├── components/
│   ├── footer.tsx
│   ├── navigation.tsx
│   ├── theme-provider.tsx
│   ├── sections/
│   │   ├── hero.tsx
│   │   ├── alpha-vectors.tsx
│   │   ├── erc8004-trinity.tsx
│   │   ├── evidence-pipeline.tsx
│   │   ├── score-story.tsx
│   │   └── verdict.tsx
│   └── ui/                  ← 60+ shadcn/ui primitives (keep as-is)
├── hooks/
├── lib/
├── public/
├── styles/
├── package.json
├── next.config.mjs
├── tsconfig.json
└── postcss.config.mjs
```

---

## 🎯 JUDGE PSYCHOLOGY — What Impresses

1. **First 3 seconds**: Hero must communicate "this is professional" — dark, clean, with one killer stat
2. **Next 10 seconds**: The Alpha Vectors must sell "this is technically deep" — not marketing fluff
3. **The "wow" moment**: The ERC-8004 Trinity interactive selector — judges will click all 3 tabs
4. **Credibility builder**: The Evidence Pipeline showing real data flowing through real contracts
5. **The proof**: Score Story with REAL metrics from REAL testnet data — not mock numbers
6. **The closer**: Verdict section showing 12/12 gates passing with zero failures — game over, we win

---

## 🚫 DO NOT

- Do NOT change the tech stack (Next.js, shadcn/ui, Framer Motion, Tailwind)
- Do NOT add heavy 3D libraries (no Three.js) — keep it fast and lightweight
- Do NOT use placeholder/lorem ipsum data — all numbers must match the real metrics.json
- Do NOT break the dark theme — this is an obsidian dark experience
- Do NOT use default blue (#3B82F6) anywhere — our brand is cyan (#00d4ff)
- Do NOT make it look like a generic SaaS template — this is a hackathon weapon
- Do NOT ignore mobile responsiveness — every section must work on mobile
- Do NOT add external paid dependencies or APIs — everything must be static/client-side
- Do NOT remove the frosted glass / backdrop-blur aesthetic — it's core to the brand
- Do NOT over-animate to the point of being distracting — elegance over flash

---

## ✅ QUALITY BAR

- **Lighthouse score**: Must hit 90+ on Performance, Accessibility, Best Practices, SEO
- **Bundle size**: Keep JS under 200KB gzipped
- **First paint**: Under 1.5s on fast connections
- **Smoothness**: All animations at 60fps
- **Accessibility**: All interactive elements keyboard-navigable, proper ARIA labels
- **SEO**: Proper meta tags, Open Graph, structured data for the hackathon submission

---

## 📝 OUTPUT EXPECTED

Produce the following files:
1. `app/page.tsx` — Updated page composition (if section order/names change)
2. `app/globals.css` — Any new CSS variables, keyframes, or utility classes
3. `components/navigation.tsx` — Redesigned nav
4. `components/sections/hero.tsx` — Redesigned hero
5. `components/sections/alpha-vectors.tsx` — Redesigned features
6. `components/sections/erc8004-trinity.tsx` — Redesigned protocol section
7. `components/sections/evidence-pipeline.tsx` — Redesigned pipeline
8. `components/sections/score-story.tsx` — Redesigned metrics with Recharts
9. `components/sections/verdict.tsx` — Redesigned verification section
10. `components/footer.tsx` — Redesigned footer

**Each file must be a COMPLETE, working React component** — no pseudocode, no "// TODO", no shortcuts. Import paths must match the existing structure. All data must use the real values provided above.

---

<div align="center">

**Make it the most beautiful crypto/AI hackathon landing page ever built.**

*Identity is the New Alpha.*

</div>

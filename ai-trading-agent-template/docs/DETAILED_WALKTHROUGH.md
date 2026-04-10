# Detailed Walkthrough

This repository supports two workflows:
- Shared Sepolia submission workflow (canonical for final evidence)
- Local Hardhat workflow (development-only)

---

## Path A: Shared Sepolia Submission Workflow (Canonical)

Use this path for all judge-facing artifacts.

### 1) Configure `.env` for the shared profile

Set these values before running submission commands:

```env
SEPOLIA_RPC_URL=https://...
CHAIN_ID=11155111
AGENT_ID=5

EXECUTION_MODE=kraken
KRAKEN_SANDBOX=true
MARKET_DATA_MODE=prism
TRADING_STRATEGY=llm
LLM_PROVIDER=groq
PLANNER_MAX_TRADE_USD=50

AGENT_REGISTRY_ADDRESS=0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3
HACKATHON_VAULT_ADDRESS=0x0E7CD8ef9743FEcf94f9103033a044caBD45fC90
RISK_ROUTER_ADDRESS=0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC
REPUTATION_REGISTRY_ADDRESS=0x423a9904e39537a9997fbaF0f220d79D7d545763
VALIDATION_REGISTRY_ADDRESS=0x92bF63E5C7Ac6980f237a7164Ab413BE226187F1
```

For strict packaging checks, set:

```env
SUBMISSION_STRICT=true
```

### 2) Start from a clean agent-5 artifact session

Archive old mixed-agent artifacts before generating the final package.

```powershell
Set-Location ai-trading-agent-template
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dst = "artifacts/archive-$stamp"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
$files = @(
  "checkpoints.jsonl",
  "fills.jsonl",
  "planner-traces.jsonl",
  "reputation-feedback.jsonl",
  "metrics.json",
  "equity-report.json",
  "phase2-evidence.json",
  "submission-manifest.json"
)
foreach ($f in $files) {
  if (Test-Path $f) {
    Move-Item -Force $f (Join-Path $dst $f)
  }
}
```

### 3) Register, fund, and snapshot shared contracts

```powershell
npm run register
npm run claim
npm run shared:contracts
```

This produces:
- `registration-proof.json`
- `capital-proof.json`
- `shared-contracts.json`

### 4) Run runtime + dashboard

Terminal 1:

```powershell
npm run run-agent
```

Terminal 2:

```powershell
npm run dashboard
npm run ui:dev
```

Open:

```text
http://localhost:3000
```

### 5) Generate the final evidence package

```powershell
npm run seed:reputation
npm run metrics
npm run replay
npm run evaluate
npm run report:equity
npm run submission:manifest:allow-missing
npm run phase2:evidence
npm run submission:manifest
npm run phase2:evidence
```

Notes:
- `report:equity` is read-only for shared mode: it computes local drawdown evidence and appends shared router guardrail reads.
- Runtime equity reports now include CPPI state and circuit-breaker snapshots (`cppi`, `runtimeRiskControls`) used for pre-trade scaling/blocking decisions.
- The two-pass manifest flow is intentional: first pass writes the manifest before `phase2-evidence.json` is regenerated, second pass locks strict readiness.
- `evaluate` persists `artifacts/runs/<RUN_LABEL>/run-summary.json`, then ranks all saved runs and writes `evaluation-results.json` + `winner-run.json` when a gate-passing winner exists.
- When a fill degrades net PnL, the runtime appends a structured context row to `reputation-context.jsonl` for transparent trust-story review.

### 6) Acceptance checklist

Submission output is considered ready when all are true:
- Checkpoint count is within 30-60 for `AGENT_ID=5`
- Fill count is within 5-15
- `metrics.json` reports positive `netPnlUsd`
- `metrics.json` reports `maxDrawdownBps <= 500`
- `metrics.json` reports `validationSource=validation-registry`
- `metrics.json` reports `reputationSource=reputation-registry`
- `reputation-feedback.jsonl` and score story show at least 3 feedback records
- `submission-manifest.json` strict mode passes
- `phase2-evidence.json` reports all checks green

---

## Path B: Local Hardhat Workflow (Dev-Only)

Use this for fast local iteration. Do not use local artifacts as submission evidence.

### 1) Start local chain

```powershell
Set-Location ai-trading-agent-template
npx hardhat node
```

### 2) Configure local `.env`

```env
SEPOLIA_RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
EXECUTION_MODE=mock
MARKET_DATA_MODE=mock
TRADING_STRATEGY=llm
LLM_PROVIDER=groq
```

### 3) Local deploy and runtime

```powershell
npm run deploy
npm run register
npm run allocate-sandbox
npm run run-agent
npm run dashboard
npm run ui:dev
```

Optional local metrics:

```powershell
npm run metrics
npm run replay
npm run evaluate
npm run report:equity
```

---

## About Faucet Usage

- Shared Sepolia flow: faucet ETH is required for gas.
- Local Hardhat flow: faucet is not required.

---

## Troubleshooting

### `Artifact identity mismatch`

Your runtime files include rows from another agent ID. Archive old artifacts and regenerate from a clean `AGENT_ID=5` session.

### `SUBMISSION_STRICT=true requires validationSource=validation-registry`

Your metrics run fell back to checkpoint-confidence. Ensure fresh validation attestations are written for the current checkpoint hashes.

### `Submission manifest is incomplete`

Set required public links:
- `SUBMISSION_GITHUB_URL`
- `DEMO_URL`
- `DEMO_VIDEO_URL`
- `DEMO_SLIDES_URL`

And ensure required evidence files exist.

### `RiskRouter` or RPC call failures

Verify `SEPOLIA_RPC_URL`, chain ID, funded wallet, and shared contract addresses in `.env`.

### `breaker active` or `CPPI floor` blocks all trades

Check `equity-report.json` fields:
- `cppi.scale`
- `runtimeRiskControls.breakerActive`
- `runtimeRiskControls.breakerReason`

If needed for tuning, adjust:
- `CPPI_FLOOR_RATIO`
- `CPPI_MULTIPLIER`
- `BREAKER_MAX_CONSECUTIVE_LOSSES`
- `BREAKER_MAX_DAILY_LOSS_USD`

### Interpreting reputation context artifacts

- `reputation-feedback.jsonl` stores objective feedback submissions.
- `reputation-context.jsonl` stores structured failure context entries (for example, negative net PnL deltas after fills) linked to `intentHash`/`txid`.
- Dashboard status now exposes a summary of both so trust-signal changes can be explained with deterministic evidence.

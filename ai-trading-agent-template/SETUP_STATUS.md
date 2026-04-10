# AI Trading Agent Submission Status

Date: 2026-04-06

## Canonical flow

- Shared Sepolia is the only submission-grade path.
- Submission identity is shared agent `5`.
- Local Hardhat deploys are development-only and should not appear in final evidence.

## What is implemented

- Shared contract snapshot generation via `npm run shared:contracts`
- Capital claim proof generation via `npm run claim`
- Strict single-agent artifact enforcement across checkpoints, fills, planner traces, and reputation evidence
- Read-only `equity-report.json` generation with local drawdown evidence plus shared router guardrail reads
- Phase 2 readiness checks split into router enforcement proof and drawdown evidence
- Strict submission manifest gating on both public links and required evidence files
- Dashboard/API risk model split into `guardrails` and `drawdownEvidence`

## Submission runbook

1. Set `.env` for the shared Sepolia profile.
   - `AGENT_ID=5`
   - `EXECUTION_MODE=kraken`
   - `KRAKEN_SANDBOX=true`
   - `MARKET_DATA_MODE=prism`
   - `TRADING_STRATEGY=llm`
   - `LLM_PROVIDER=groq`
   - `PLANNER_MAX_TRADE_USD=50`
2. Archive old root artifacts if they contain mixed agent histories.
3. Run `npm run register`, `npm run claim`, and `npm run shared:contracts`.
4. Run `npm run run-agent` until you have a fresh agent-`5` session with enough checkpoints and at least one fill.
5. Generate outputs in this order:
   - `npm run metrics`
   - `npm run replay`
   - `npm run evaluate`
   - `npm run report:equity`
   - `npm run submission:manifest:allow-missing`
   - `npm run phase2:evidence`
   - `npm run submission:manifest`
   - `npm run phase2:evidence`
6. Build the demo with `npm run ui:build`.

## Final acceptance target

- At least 25 fresh checkpoints for agent `5`
- At least 1 approved executed trade
- `metrics.json` validation source is `validation-registry`
- Reputation feedback count is non-zero
- `submission-manifest.json` strict mode passes
- `phase2-evidence.json` reports all checks passed

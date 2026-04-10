<!-- markdownlint-disable-file -->

# Upgrade Guide

This guide covers the move from the deterministic momentum-only setup to the planner-executor stack.

## What Changed

- The agent can now use a strict planner path backed by Groq or OpenRouter.
- Planner decisions are logged to `planner-traces.jsonl`.
- Live market data can be enabled separately from execution through `MARKET_DATA_MODE`.
- Paper execution is kept by default through the new paper broker path.
- The operator console now lives in `ui/` as a Vite + React app.

## Recommended Rollout

1. Keep `TRADING_STRATEGY=momentum` until you want to exercise the planner.
2. Set `MARKET_DATA_MODE=mock` first to validate the new planner without live market feeds.
3. Set `LLM_PROVIDER=groq` and add `GROQ_API_KEY` as environment variables, or keep the OpenRouter keys if you prefer that provider.
4. Switch `TRADING_STRATEGY=llm` and run `npm run llm:smoke` before the full agent loop.
5. Enable `MARKET_DATA_MODE=kraken` once you are comfortable with paper-only execution.
6. Use `npm run ui:dev` for the new console and keep `npm run dashboard` only as a legacy fallback.

## Rollback Plan

If the planner path misbehaves:

- Set `TRADING_STRATEGY=momentum` to force the deterministic strategy.
- Set `MARKET_DATA_MODE=mock` to remove live market dependencies.
- Remove or unset the Groq/OpenRouter keys to disable planner calls.
- Keep `EXECUTION_MODE=mock` so execution stays paper-only.

## Operational Checks

- `npm run evaluate` snapshots run labels/parameters, enforces one-shot hard gates, and selects the best candidate across saved runs.
- `npm run replay` prints recent score-story and trace history.
- `npm run llm:smoke` exercises the planner entrypoint and should fall back safely if keys are missing.
- `npm run ui:build` validates the React console.

## Notes

- No raw API keys should be committed.
- The planner is intended to suggest and explain, not bypass the deterministic risk controls.
- The old dashboard remains available as a compatibility layer, but the new console is the primary operator surface.

/**
 * BTC race bot for make.fun btc-race-24h-20261117-0603.
 *
 * Strategy: trend-filtered dip-buying on 1-minute cbBTC/USDC bars.
 * The dev window (16-17 Nov 2026) is range-bound, +0.49% over 24h, with
 * 1-minute returns of ~6 bps stdev and multi-hour swings of 0.5-1.5%.
 * Dips 0.8% below the 60-bar average revert about +1.0% over the next
 * 2 hours, 94% of the time beating the ~26 bps round-trip cost, so the
 * bot buys those dips and lets the reversion play out. A full-size round
 * trip pays ~26 bps in fee + slippage + impact, so exits are wide: take
 * profit +2.0%, stop loss -1.0%, trailing stop -1.0% off the peak, max
 * hold 480 bars (8h). A trend filter (60-bar average above the 240-bar
 * average) keeps it out of downtrends: on the previous race's dev
 * window (BTC -4% in 24h) the same rules with the filter make 0 trades
 * and lose nothing, while without it they lose ~$37.
 *
 * Backtest (exact integer fill model, verified against grade-local on
 * buy-and-hold to the micro-USDC): dev window +$29.47 on 2 round trips
 * (+$18.57, +$10.90), previous window $0.00 on 0 trades. Buy-and-hold
 * on the dev window makes +$1.07.
 *
 * Safety brakes: no new entries once cumulative realised loss reaches
 * -$25, and none in the last 90 bars of the window. Long only, all-in
 * on one position at a time, one order per batch at most.
 *
 * Deterministic: integer money math, float64 indicators summed in bar
 * order, no randomness, no wall clock, no network, no files. The same
 * bars give the same orders on every run.
 *
 * Protocol: agent-fun/bars-replay/v1, via the vendored SDK shim. The
 * harness sends hello once, then one batch per minute (the bar that
 * closed, the fills of the orders sent on the previous batch, and the
 * account); the bot answers every batch with exactly one reply echoing
 * its seq. Orders decided on a batch fill at the next bar's open.
 */

import { runBars, type Bar, type BarsState } from './vendor/makefun-bars.ts';

const SYM = 'CBBTC';

/** Dip reference: 60-bar simple moving average of closes. */
const SMA_FAST = 60;
/** Trend filter: 240-bar simple moving average of closes. */
const SMA_SLOW = 240;
/** Buy when close <= SMA_FAST * (1 - DIP): 0.8% below the average. */
const DIP = 0.008;
/** Take profit: position value >= cost * (1 + TP_BPS / 10000). */
const TP_BPS = 200;
/** Stop loss: position value <= cost * (1 - SL_BPS / 10000). */
const SL_BPS = 100;
/** Trailing stop: close <= peak close * (1 - TRAIL_BPS / 10000). */
const TRAIL_BPS = 100;
/** Max bars to hold one trade (480 bars = 8 hours). */
const MAX_HOLD = 480;
/** Max slippage vs the latest close, in bps (1-minute moves are <0.5%). */
const MAX_SLIPPAGE_BPS = 200;
/** Stop opening new trades once cumulative realised loss hits -$25. */
const LOSS_BRAKE_UNITS = -25_000_000n;
/** Bars in the scored window. */
const WINDOW_BARS = 1440;
/** No new entries in the last 90 bars of the window. */
const NO_ENTRY_LAST_BARS = 90;

const closes: number[] = [];
let owner: string | null = null;
let pendingOwner: string | null = null;
let peakClose = 0n;
let heldBars = 0;
let openCost = 0n;
let realised = 0n;

/** Simple moving average of the last n closes, oldest first, or null. */
function sma(n: number): number | null {
  if (closes.length < n) return null;
  let sum = 0;
  for (let i = closes.length - n; i < closes.length; i++) sum += closes[i];
  return sum / n;
}

await runBars({
  onBatch(state: BarsState, batch) {
    // Fold this batch's fills into the realised-PnL brake.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYM || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        openCost = BigInt(fill.notional_quote_units);
      } else {
        realised += BigInt(fill.notional_quote_units) - openCost;
        openCost = 0n;
      }
    }

    // Fold this batch's bar into the indicator history.
    let fresh = false;
    for (const bar of batch.bars) {
      if (bar.symbol !== SYM) continue;
      closes.push(Number(bar.c));
      fresh = true;
    }
    if (!fresh || state.warmingUp) return [];

    const close = state.close(SYM);
    if (close === null) return [];
    const held = state.positions.get(SYM);

    if (held !== undefined) {
      if (owner === null) {
        owner = pendingOwner ?? 'mr';
        peakClose = close;
        heldBars = 0;
      }
      if (close > peakClose) peakClose = close;
      heldBars += 1;
    } else {
      owner = null;
      pendingOwner = null;
    }

    // Exits: take profit, stop loss, trailing stop, max hold.
    if (held !== undefined) {
      const value = state.value(SYM, held.qty);
      const cost = held.cost;
      const takeProfit = value * 10000n >= cost * BigInt(10000 + TP_BPS);
      const stopLoss = value * 10000n <= cost * BigInt(10000 - SL_BPS);
      const trailing = close * 10000n <= peakClose * BigInt(10000 - TRAIL_BPS);
      const timedOut = heldBars >= MAX_HOLD;
      if (takeProfit || stopLoss || trailing || timedOut) {
        return [{ side: 'sell', symbol: SYM, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Entries (flat only).
    if (realised <= LOSS_BRAKE_UNITS) return [];
    const scored = state.seq - state.warmupBars;
    if (scored >= WINDOW_BARS - NO_ENTRY_LAST_BARS) return [];
    const cash = state.cash;
    if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];

    const fast = sma(SMA_FAST);
    const slow = sma(SMA_SLOW);
    if (fast === null || slow === null) return [];
    // Trend filter: only buy dips while the short average sits above the
    // long one; in a downtrend the bot stays in cash.
    if (fast < slow) return [];
    // Dip buy: close 0.8% below the 60-bar average.
    if (close <= BigInt(Math.floor(fast * (1 - DIP)))) {
      pendingOwner = 'mr';
      return [{ side: 'buy', symbol: SYM, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});

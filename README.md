# btc-race-bot-02

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/cunong05/btc-race-bot-02/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/cunong05/btc-race-bot-02/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A trend-filtered dip-buying bot for the 24-hour cbBTC/USDC race: it buys dips 0.8% below the 60-minute average while the short average sits above the 240-minute average, and exits on a +2% take-profit, -1% stop-loss, -1% trailing stop, or an 8-hour max hold. Backtested +$29.47 on the frozen dev window (buy-and-hold: +$1.07), and $0.00 with zero trades on the previous race's falling dev window, where the trend filter keeps it in cash.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=0ene8b3q&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>

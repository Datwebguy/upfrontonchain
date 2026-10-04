# Upfront (@upfrontonchain)

**Pitch:** *"Upfront: every trade in your pool pays you, and you can get those earnings upfront."*

**Hackathon:** Arbitrum Open House Singapore. Built on Robinhood Chain, using USDG throughout.

## What it is
1. **Launch a pool with a fee hook in one click.** A Uniswap v4 hook (an add-on contract that runs inside a swap) is built in when the pool is created, on any pair including stock tokens. The total fee (the pool's trading fee plus the Upfront fee) is shown openly before every trade. A share of each Upfront fee goes automatically to the owner, the app, and whoever sent the trade (the referrer).
2. **Fees arrive in USDG with every trade.**
3. **Get your earnings upfront.** After a track record builds, an advance is offered. A share of each new fee repays it automatically. Once it's repaid, 100% of fees return to the owner.

Note: hooks are fixed when a pool is created, so Upfront always creates a new pool with the hook built in. It can't be added to an existing pool.

## Who uses it
- **Trading apps and bots:** earn openly from their users' trades.
- **Token and community creators:** earn from every trade in their coin's pool.
- **Launchpads:** use a ready-made, reviewed hook instead of building their own.
- **Communities on stock tokens:** earn from the trades they bring in.
- **Games:** every in-game trade pays the game.
- **Traders:** see the real fee upfront, with no hidden cut.
- **Lenders:** put USDG in a vault and earn from advances that repay themselves.

## Revenue
- A cut of every hook fee.
- A flat fee on every advance.

## Why now (evidence)
- About three quarters of trades on Uniswap v4 on Robinhood Chain go through hooks.
- The top 5 hooks carry 92.5% of hooked volume.
- 1 in 6 hooks has never handled a trade.
- The biggest hook shows "0% fee" but takes a median 1% of every swap. It made about $1M in 4 days.
- Hooks that run before a swap reject more than 1% of trades.

Source: [Bitquery](https://bitquery.io/investigations/uniswap-v4-hooks-robinhood-chain).

**Funding gap:**
- Robinhood Chain apps earned $98M in revenue in 30 days (DefiLlama).
- Early-stage crypto funding was $290M in Q2 2026, the lowest on record ([CryptoRank via KuCoin](https://www.kucoin.com/news/flash/crypto-early-stage-funding-drops-50-since-q2-2024-investors-favor-mature-projects)).

**Precedents on other chains:**
- **Flaunch (Base):** sends all trading fees to creators and buybacks. 793 ETH paid to creators so far.
- **Credit Coop (Ethereum and Base):** lends against future revenue. $1B+ lent with zero defaults, and a lending program with Visa announced in September 2026.

**Overlap:** none of the 714 Arbitrum Open House buildathon projects does this.

## Demo
1. Launch a pool with the hook built in. The fee is shown upfront.
2. Run trades. The fees split live on screen.
3. An advance offer appears, and the creator accepts it.
4. Each new fee repays the advance automatically. Once it's repaid, 100% of fees go back to the creator.

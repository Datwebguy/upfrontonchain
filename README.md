# Upfront

**Every trade in your pool pays you, and you can get those earnings upfront.**

Upfront launches trading pools on Arbitrum and Robinhood Chain that pay their owners a fee on every trade, in USDG. Once a pool has a track record, its owner can get part of its future earnings today, repaid automatically from a share of new fees.

[@upfrontonchain](https://x.com/upfrontonchain) · Built on Arbitrum and Robinhood Chain · Paid in USDG

> **Status:** in development. Nothing is deployed yet. Contract addresses will be listed under [Deployments](#deployments) once they're live.

---

## The problem

**Hidden fees.** About three quarters of Uniswap v4 trades on Robinhood Chain go through hooks. The largest one shows a 0% fee but takes a median 1% of each swap. ([Bitquery, 4–8 Sep 2026](https://bitquery.io/investigations/uniswap-v4-hooks-robinhood-chain))

**Hooks are hard to build.** About 1 in 6 hooks with a pool has never handled a trade, and hooks that run before a swap reject more than 1% of trades. (same source)

**Apps earn, but can't raise.**
- Robinhood Chain apps earned about $98M in revenue in 30 days ([DefiLlama](https://api.llama.fi/overview/fees/Robinhood)).
- Early-stage crypto funding was $290M in Q2 2026, down 50% from Q2 2024 ([CryptoRank via KuCoin](https://www.kucoin.com/news/flash/crypto-early-stage-funding-drops-50-since-q2-2024-investors-favor-mature-projects)).

## How it works

1. **Launch a pool.** Pick a token, set your fee and how it splits between you, your app and whoever sends the trade. The total fee is shown to every trader before they confirm.
2. **Every trade pays you.** Fees arrive in USDG and can be claimed any time.
3. **Get your earnings upfront.**
   - When your pool qualifies, you get an offer based on its weakest recent week.
   - Accept it, and USDG arrives from the lender vault.
   - A share of each new fee repays it automatically. When it's repaid, your full share comes back.

```
Trader ──swap──> Uniswap v4 pool ──> Upfront takes the shown fee in USDG
                                          │
                     owner · app · referrer · protocol balances
                                          │
                     (advance open) repay share ──> lender vault
```

## Who it's for

| | |
|---|---|
| **Creators and communities** | Your coin's trades pay you. |
| **Trading apps, bots and launchpads** | Earn openly from the trades you bring, without building your own hook. |
| **Referrers** | Get paid for every trade you send. |
| **Traders** | The fee you see is the fee you pay. |
| **Lenders** | Earn from advances that repay themselves, all visible on-chain. |

## Deployments

Not deployed yet. Each address will link to its explorer page once live.

| Network | Contract | Address |
|---|---|---|
| Arbitrum Sepolia (421614) | UpfrontHook · UpfrontLauncher · AdvanceDesk · LenderVault | — |
| Robinhood Chain testnet (46630) | UpfrontHook · UpfrontLauncher · AdvanceDesk · LenderVault | — |

External contracts Upfront uses (Uniswap v4, USDG) are listed and verified in [RESOURCES.md](RESOURCES.md).

## Run it locally

Setup steps will be added with the code. The planned stack:
- contracts: Foundry,
- website and app: Next.js, wagmi and viem,
- history: an event indexer.

## Tests

The test plan, including fuzzing, invariants and fork tests against Robinhood Chain testnet, is in [BUILD_SPEC.md](BUILD_SPEC.md) §11 and [SECURITY.md](SECURITY.md) §2.

## Risks

- **For owners:** repayment comes from your fees automatically. If your pool falls far behind schedule, a larger share of fees goes to repayment until it catches up.
- **For lenders:** a pool's trading can slow or stop, so an advance can be repaid late or not in full. Offers are sized on a pool's weakest recent week to limit this, but lending carries risk.
- **For everyone:** the contracts will be audited before mainnet. See [SECURITY.md](SECURITY.md).

## Project docs

| Doc | What's in it |
|---|---|
| [BUILD_SPEC.md](BUILD_SPEC.md) | Product rules, architecture, contracts, tests, demo |
| [DESIGN.md](DESIGN.md) | Brand, motion, website and app flow |
| [SECURITY.md](SECURITY.md) | Invariants, threat model, path to mainnet |
| [ROADMAP.md](ROADMAP.md) | Where Upfront is going |
| [FAQ.md](FAQ.md) | Common questions |
| [RESOURCES.md](RESOURCES.md) | Verified links and addresses |
| [AGENTS.md](AGENTS.md) | Rules for anyone, human or tool, working on the code |
| [docs/ONE_PAGER.md](docs/ONE_PAGER.md) | Upfront on one page |

## Security

Found a vulnerability? Please report it privately to the maintainer through GitHub ([@Datwebguy](https://github.com/Datwebguy)) rather than opening a public issue.

## License

[MIT](LICENSE)

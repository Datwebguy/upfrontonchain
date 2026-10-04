# Upfront: build spec

**Handle:** @upfrontonchain

**Pitch:** *"Upfront: every trade in your pool pays you, and you can get those earnings upfront."*

**Network:** Robinhood Chain (an Arbitrum chain). **Currency:** Paxos USDG.

**First milestone:** Arbitrum Open House Singapore. **Horizon:** a company, not a demo.

**Companion docs:**
- `AGENTS.md`: how to work on the code
- `DESIGN.md`: look, motion, flow, words
- `SECURITY.md`: threat model, invariants, audit plan
- `ROADMAP.md`: where this goes
- `FAQ.md`: website FAQ
- `RESOURCES.md`: every verified link and address

---

## 1. Product in one paragraph

Anyone can launch a Uniswap v4 pool with Upfront built in. Every trade in that pool pays an Upfront fee in USDG, on top of the pool's normal trading fee, and the trader sees the **total** before confirming. Each Upfront fee is split automatically between:
- the **pool owner**,
- the **app** that the pool was launched for,
- the **referrer** that sent the trade,
- the **protocol**.

Once a pool has a track record, its owner can take an **advance**: USDG paid now from a lender vault. The advance is repaid automatically from a share of the owner's future fees. When it's repaid, the owner's full share resumes.

## 2. Why this exists

Keep these facts in the README with their sources. They don't appear inside the product.

**Hooks on Robinhood Chain** (4–8 Sep 2026, [Bitquery](https://bitquery.io/investigations/uniswap-v4-hooks-robinhood-chain)):
- 74.5% of Uniswap v4 trades go through a hook.
- About 1,047 hooks are deployed; 1 in 6 with a pool has never handled a trade.
- The top 5 hooks carry 92.5% of hooked volume.
- The largest hook shows a 0% fee but takes a median 1% of each swap, earning about $1M in 4 days.
- Hooks that run before a swap reject more than 1% of trades.

**The funding gap:**
- Robinhood Chain apps earned about $98M in revenue in 30 days ([DefiLlama](https://api.llama.fi/overview/fees/Robinhood)).
- Early-stage crypto funding was $290M in Q2 2026, down 50% from Q2 2024 ([CryptoRank via KuCoin](https://www.kucoin.com/news/flash/crypto-early-stage-funding-drops-50-since-q2-2024-investors-favor-mature-projects)).

**Proven elsewhere:**
- **Flaunch** (Base): all fees go to creators and buybacks; 793 ETH paid to creators.
- **Credit Coop** (Ethereum and Base): lends against future revenue; $1B+ lent, zero defaults reported, and a Visa lending program announced in Sep 2026 ([Crypto Briefing](https://cryptobriefing.com/visa-onchain-lending-credit-coop/)).

## 3. Users and the job each one hires Upfront for

| User | Job |
|---|---|
| Creator or community | "Make my coin's trading pay me, and let me use that money now." |
| Trading app, bot or launchpad | "Earn openly from the trades I bring, without building and maintaining hooks." |
| Referrer | "Get paid for every trade I send." |
| Trader | "Show me exactly what I'll pay." |
| Lender | "Earn from advances I can watch being repaid." |

## 4. Product rules

These are non-negotiable. Every rule has a matching test (§11) and an invariant (`SECURITY.md`).

1. **The total fee shown is the total fee charged.**
   - The trade screen shows the pool's trading fee plus the Upfront fee, as one total with a breakdown.
   - A view function returns the exact Upfront fee for any swap.
2. **A pool's Upfront fee is set at launch and can only be lowered.** There's a hard maximum per pool, set in the launcher (for example 2%).
3. **Upfront fees are taken in USDG only.** v1 accepts only pools paired with USDG.
4. **A swap never fails because of Upfront.** Swap callbacks only update balances. Payees claim later.
5. **Split parties:**
   - **Owner** and **app** are set at launch.
   - **Referrer** comes with each trade (passed by the interface). If there is none, that share goes to the owner.
   - **Protocol** share is fixed per pool at launch.
   - **Shares can't change after launch.**
6. **An advance takes only from the owner's share.** Never from the app's, the referrer's, the protocol's or the liquidity providers'.
7. **Pool ownership can't be transferred while an advance is open.**
8. **Admins can't touch swaps or balances.** Protocol admin (a multisig) can only:
   - change the advance settings for *future* offers, within hard bounds,
   - pause *new* advances,
   - set the protocol share for *future* pools, within hard bounds.
9. **Contracts are not upgradeable.** New versions are new deployments. Users choose to move. The app shows which version a pool uses.
10. **Everything a user sees is real.** On-chain data or a live API, never typed-in numbers (§10).

## 5. Architecture

```
                 ┌──────────────── interface passes referrer in hookData
Trader ──swap──> PoolManager (Uniswap v4) ──callbacks──> UpfrontHook
                                                          │  takes Upfront fee in USDG (USDG leg only)
                                                          │  records earnings per pool per day
                                                          ▼
                                     balances:  owner │ app │ referrer │ protocol
                                                  │
                                    (if advance open) repay share ───> AdvanceDesk ───> LenderVault
                                                  │                         ▲                │
                                                claim()                     └─ advance paid ─┘
```

### Contracts (`packages/contracts`, Foundry, Solidity ^0.8.26)

| Contract | Job |
|---|---|
| `UpfrontHook.sol` | Serves all Upfront pools, keyed by `PoolId`. Takes the Upfront fee on the USDG leg. Credits the four balances, or the repayment, per §7. Records daily earnings. Handles claims. |
| `UpfrontLauncher.sol` | Creates pools with the hook, stores each pool's config (Upfront fee, max fee, owner, app, shares, version), adds first liquidity through `PositionManager`, and handles ownership changes (blocked while an advance is open). |
| `AdvanceDesk.sol` | Eligibility, offers, acceptance, payout from the vault, repayment tracking, the behind-schedule rule, closing. |
| `LenderVault.sol` | ERC-4626 vault in USDG. Funds advances, receives repayments, reports advances outstanding. |
| `RevenueMath.sol` | Pure library: daily buckets, weakest-week calculation, offer size, flat fee, schedule floor. |
| `Errors.sol`, `Events.sol`, `Types.sol` | Shared custom errors, events and structs. |

**Optional:** `packages/offer-engine`, a Stylus (Rust) port of the offer maths. It must match `RevenueMath` exactly, on the same inputs, in tests.

## 6. Hook design

**Permissions.** The hook address must encode these flags. Mine the salt with `HookMiner` (v4-periphery).
- `BEFORE_INITIALIZE`: only `UpfrontLauncher` may create pools on this hook, and one side must be USDG.
- `BEFORE_SWAP` + `BEFORE_SWAP_RETURNS_DELTA`: take the fee when USDG is the **specified** currency.
- `AFTER_SWAP` + `AFTER_SWAP_RETURNS_DELTA`: take the fee when USDG is the **unspecified** currency.

**Fee:**
- `fee = usdgAmount × upfrontFeeBps / 10_000`, rounded down.
- Taken with `poolManager.take(USDG, address(this), fee)`, returning the matching delta.
- Build on OpenZeppelin Uniswap Hooks (`BaseHook`, and its fee base contracts where they fit). Pin the version.

**Referrer:**
- Read from `hookData` as an address.
- Empty, malformed or zero means no referrer. Never revert because of `hookData`.

**Earnings record:**
- Per pool: total owner earnings, plus a 35-slot ring buffer of daily owner earnings (day = `block.timestamp / 1 days`).
- Emits `FeeTaken(poolId, trader, referrer, usdgAmount, fee, day)`.

**Gas:**
- No loops. No external calls except `PoolManager`.
- Target under 30K gas added per swap. Measure it in a gas snapshot test.

**Claims:**
- `claim()` pays the caller's USDG balance.
- Checks-effects-interactions, plus a reentrancy guard.
- Emits `Claimed`.

## 7. Advance design

**Eligibility.** These are deployment parameters with hard bounds in code:
- `minHistoryDays` (mainnet 14, testnet 1),
- `minWeeklyEarnings` in USDG (mainnet 1,000, testnet 10),
- no open advance on the pool,
- pool on the current version.

**Offer** (computed in `RevenueMath`):
- `weakest` = lowest weekly owner earnings across the last 4 complete weeks (testnet: last 4 complete days).
- `amount = min(weakest × 4, poolCap, vaultAvailable × maxShareOfVault)`
- `flatFee` from 6% to 12%: lower when weekly earnings are steadier.
- `totalDue = amount × (1 + flatFee)`
- `repayShare` = 20% of the owner's share.
- Offers expire after 24 hours. They are recomputed, never cached.

**Repayment:**
- While an advance is open, the hook credits `repayShare` of the owner's share to `AdvanceDesk` on every fee. The owner gets the rest.
- `AdvanceDesk` sends repayments to the vault, with the flat fee split between lenders and protocol (protocol cut fixed, for example 15%).
- When `repaid ≥ totalDue`, the advance closes in the same transaction and the owner's full share resumes.

**Behind schedule:**
- If less than 25% is repaid after 60 days (testnet: 25% after 2 days), `repayShare` becomes 100% of the owner's share until repaid.
- Nothing else is taken.

**Honest risks** (README and FAQ):
- The owner can launch a new pool and move traders.
- Liquidity providers can withdraw.
- Earnings can fall.
- **The answer is design, not promises:**
  - sizing on the weakest week,
  - about one month of earnings per advance,
  - automatic repayment,
  - public repayment records per owner.
- Lenders can lose money.

## 8. Website and app

The website and the app are separate experiences. `DESIGN.md` is the source of truth for both.

**Website (`/`).** Hero, live totals, how it works, who it's for, honest fees, FAQ, final call, footer. Every section leads into the app.

**App (`/app`):**

| Route | Screen |
|---|---|
| `/app` | Your pools, your earnings, quick actions |
| `/app/launch` | Launch in three steps: token → fee and split → add funds |
| `/app/pool/[id]` | Earnings, claim, Upfront offer, repayment |
| `/app/trade/[id]` | Swap with the total fee shown before confirming |
| `/app/lend` | Deposit, withdraw, advances funded |
| `/api/health` | Chain id and block number; not linked in the UI |

**Data layer:**
- Reads go through viem, plus a light event indexer for history, totals and charts: `packages/indexer` (Ponder or an equivalent open-source indexer).
- The indexer only reads chain events. It never stores anything the chain doesn't say.

## 9. Networks

All addresses are in `RESOURCES.md`, checked on-chain on 4 Oct 2026.

| Stage | Network | Notes |
|---|---|---|
| Build and demo | Robinhood Chain testnet (46630) | Uniswap v4 and USDG (`0x7E95…802F`, 6 decimals) are live; stock tokens from the faucet |
| Backup | Arbitrum Sepolia (421614) | Uniswap v4 and USDG live |
| Launch | Robinhood Chain mainnet (4663) | After audit (`SECURITY.md`) |

## 10. Data rules (no hardcoding, no mock data)

1. **Addresses and RPC URLs live only in `packages/config/networks.ts`,** each with its source link. Nothing is typed anywhere else.
2. **Tokens are read live:**
   - mainnet from Robinhood's assets API (`https://api.robinhood.com/rhj/assets`),
   - testnet from the explorer API plus the faucet list in `networks.ts`.
   - Exclude lending receipt tokens.
3. **Every number on screen comes from the chain, the indexer or a live API.** No typed-in stats, sample pools, demo users, mock tokens or fake trades.
4. **Testnet uses real testnet assets and real trades.** Faster testnet windows are deployment parameters, stated in the README.
5. **Empty states say so** and point to the next action.
6. **Stock-token amounts use the ERC-8056 multiplier.**

## 11. Tests

**Unit (Foundry):**
- Fee maths for exact-in and exact-out, both directions, USDG specified and unspecified; rounding; zero amounts; the maximum fee.
- Fee charged = fee quoted.
- Splits always sum to the fee. A missing referrer goes to the owner. Malformed `hookData` never reverts.
- Only launcher pools; USDG required; the fee only goes down; shares immutable.
- Advance: eligibility edges, offer maths, expiry, acceptance, per-fee repayment, the same-transaction close, behind-schedule switching, the ownership lock.
- Vault: deposit and withdraw, share price after repayment, after a shortfall, and with rounding.
- Claims: reentrancy, zero balance, a payee contract that rejects transfers.

**Fuzz and invariant** (the list is in `SECURITY.md`): run with at least 10,000 runs in CI.

**Fork:** Robinhood Chain testnet with real USDG, real stock tokens and the real PoolManager.

**Gas snapshots:** fail CI if swap overhead grows by more than 5%.

**Web:**
- Playwright smoke tests for each route.
- The launch flow against a local fork.

## 12. Repo layout

```
upfront/
├── packages/
│   ├── contracts/      Foundry: src/, test/, script/, snapshots/
│   ├── config/         networks.ts (only place for addresses and RPC URLs)
│   ├── indexer/        event indexer for history and totals
│   ├── web/            Next.js: website (/) and app (/app)
│   └── offer-engine/   optional Stylus crate
├── .github/workflows/  CI: build, lint, test, fuzz, gas, web build
├── README.md           problem, evidence, how it works, deployments, setup, tests, risks
├── AGENTS.md  DESIGN.md  SECURITY.md  ROADMAP.md  FAQ.md  RESOURCES.md
├── .env.example        names only, no values
└── LICENSE             MIT
```

**README outline:**
1. One line + 20-second demo GIF
2. The problem with sources
3. How it works (diagram)
4. Deployments (addresses with explorer links)
5. Run it locally
6. Tests
7. Risks
8. Roadmap link
9. Licence

## 13. Definition of done (every change)

- [ ] Tests added or updated, and all passing (unit, fuzz, invariant, fork where relevant)
- [ ] Gas snapshot checked
- [ ] No address, number or URL typed outside `networks.ts`
- [ ] UI wording follows `DESIGN.md` §6; the empty, loading and error states are designed
- [ ] Reduced-motion version works
- [ ] Docs updated if behaviour changed (README, FAQ, `SECURITY.md`)
- [ ] Commit authored by the repository owner only

## 14. Build order

1. **Core:** `UpfrontHook` + `UpfrontLauncher`, with the full test suite. Ship this first; everything else depends on it.
2. **App:** launch, pool and trade screens on testnet, plus the indexer.
3. **Money:** `LenderVault` + `AdvanceDesk`, with tests and invariants.
4. **App:** lend screen and the Upfront offer flow.
5. **Website:** per `DESIGN.md`.
6. **Polish:** README, demo recording, submission.

## 15. Demo (under 3 minutes)

Every step is real testnet activity. Start trading the demo pool at least one day before recording.

1. **Problem (20s):** "Three quarters of Uniswap v4 trades here go through hooks. The biggest shows 0% and takes about 1%. Apps earn real money but can't raise any."
2. **Launch (30s):** a TSLA/USDG pool. The total fee is shown, with the Upfront part split owner / app / referrer / protocol.
3. **Trades (30s):** swaps land, and each fee splits live on screen.
4. **Upfront (40s):** the pool's real offer from its own history. Accept, and USDG arrives.
5. **Repayment (30s):** more trades fill the bar. A transfer of ownership is blocked while the advance is open. The bar completes, and the full share resumes.
6. **Close (10s):** the pitch line.

## 16. Submission checklist

- [ ] Deployed on Robinhood Chain testnet (and Arbitrum Sepolia), with explorer links
- [ ] Public repo, MIT, `.env.example` only, CI green
- [ ] README per §12
- [ ] Demo video under 3 minutes, plus a backup
- [ ] USDG used throughout, and said so in the submission
- [ ] No AI tools named as authors or co-authors anywhere
- [ ] No hardcoded stats, mock data or sample content
- [ ] Website and app match `DESIGN.md`; FAQ from `FAQ.md`

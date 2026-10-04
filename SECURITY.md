# Upfront: security

Upfront holds other people's money: fee balances and lender deposits. Security is a product feature. This file is the threat model, the invariants every build must prove, and the path to mainnet.

---

## 1. What must never happen

1. A trader is charged more than the total fee shown.
2. A swap fails because of Upfront.
3. Anyone moves a balance that isn't theirs.
4. An advance takes from anyone except the owner's share.
5. The protocol admin changes a live pool's fee, shares or balances.
6. Lender funds leave the vault except as an accepted advance or a withdrawal.
7. The hook's USDG holdings fall below what everyone can claim.

## 2. Invariants

Each one is a Foundry invariant test, run with at least 10,000 runs in CI.

| # | Invariant |
|---|---|
| I-1 | `USDG.balanceOf(hook) ≥ Σ claimable balances + Σ pending repayments` |
| I-2 | For every swap: `owner + app + referrer + protocol (+ repay) == fee` |
| I-3 | For every swap: `fee == quoteFee(pool, swap)` |
| I-4 | A pool's `upfrontFeeBps` never increases, and never exceeds `maxFeeBps` |
| I-5 | A pool's shares never change after launch |
| I-6 | While an advance is open: `owner(pool)` is unchanged, and repayment only comes from the owner's share |
| I-7 | `repaid ≤ totalDue`. An advance closes exactly when `repaid == totalDue`. |
| I-8 | `vault.totalAssets() == idle USDG + outstanding advance principal − written-off amounts` |
| I-9 | Only `PoolManager` can call hook callbacks. Only `UpfrontLauncher` can create Upfront pools. |
| I-10 | Swaps with any `hookData` (empty, short, long, malformed) never revert because of Upfront |

## 3. Threat model

| Threat | Defence |
|---|---|
| Hidden or raised fees | Fee fixed at launch and can only go down; hard max; `quoteFee` view; I-3, I-4 |
| A malicious pool registers on the hook | `beforeInitialize` only accepts `UpfrontLauncher` |
| Griefing swaps through payee contracts | No transfers in callbacks; pull-based claims |
| Reentrancy on claim or vault | Checks-effects-interactions; guards; tests with attacker contracts |
| Rounding drift | Fee rounds down; vault rounding favours the vault; fuzzing at dust amounts |
| Owner escapes repayment by moving traders | Small advances sized on the weakest week; public repayment record per owner; behind-schedule rule |
| Owner transfers the pool to dodge repayment | Ownership locked while an advance is open (I-6) |
| Fake earnings to inflate offers (wash trading) | Offers use the **weakest** week; the fee paid on wash trades is a real cost to the washer; cap per pool; cap share of vault; eligibility needs a minimum history |
| Liquidity pulled after an advance | Sizing rules; future: optional liquidity lock as collateral for larger advances |
| Admin key compromise | Admin is a multisig; it can only change future-offer settings within hard bounds and pause new advances; it can't touch balances, live pools or swaps |
| Hook address flag mismatch | Salt mined for exact flags; a deploy script asserts the flags; test checks the permissions |
| Stock-token corporate actions | Display uses the ERC-8056 multiplier; fees are always in USDG, so accounting never depends on a stock token's multiplier |
| Chain halt or sequencer outage | No time-critical liquidations; repayment schedule measured in days |

**Lessons from audited prior art:**
- **Debt DAO's Spigot** (Code4rena, Nov 2022): whitelisted functions were stored globally instead of per revenue contract ([issue #71](https://github.com/code-423n4/2022-11-debtdao-findings/issues/71)). Upfront avoids the whole class: there is no arbitrary call forwarding at all.
- **Hook rejection rates** on Robinhood Chain (Bitquery): `beforeSwap` hooks rejected more than 1% of trades. I-10 and the no-revert rule exist because of this.

## 4. Path to mainnet

1. Full test suite green, with invariants at 10,000+ runs.
2. Static analysis (Slither) clean, or every finding documented.
3. An internal review against this file.
4. An external audit by an independent firm, or an audit contest.
5. A bug bounty published before mainnet. Scope: the hook, launcher, desk and vault.
6. **Mainnet in stages:**
   - pools first, with no advances,
   - then advances with small caps,
   - caps raised as repayment history builds.

## 5. If something goes wrong

1. **Pause new advances** (the only switch that exists). Swaps and claims keep working.
2. Post a status note on the website and @upfrontonchain within one hour, in plain words.
3. Publish a post-mortem within 72 hours: what happened, the impact, the fix.
4. Ship fixes as a new version. Users choose to move. Contracts are never upgraded in place.

## 6. Reporting a vulnerability

The README must include a private reporting contact (a security email). Ask reporters not to disclose publicly until a fix ships. Never put real keys, seeds or private endpoints in issues.

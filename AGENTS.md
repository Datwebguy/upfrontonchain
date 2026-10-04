# AGENTS.md

The operating manual for any AI coding agent working on **Upfront**. Follow it exactly. When this file and your own habits disagree, this file wins. When this file and `SECURITY.md` disagree, `SECURITY.md` wins and you report the conflict.

---

## 0. Before you write any code

Read these, in order:

1. `BUILD_SPEC.md`: what we're building and the product rules (§4)
2. `SECURITY.md`: invariants and threat model
3. `DESIGN.md`: look, motion, flow and words
4. `RESOURCES.md`: every verified address and link
5. `FAQ.md`: how we explain the product
6. `ROADMAP.md`: so today's code doesn't block tomorrow
7. `README.md`

Then restate, in your own words, the task, the files you'll touch and the tests you'll add, before you start.

## 1. What Upfront is

- Anyone launches a Uniswap v4 pool with Upfront built in.
- Every trade pays an openly shown Upfront fee in USDG, on top of the pool's trading fee, split between the owner, app, referrer and protocol.
- Owners can take an advance from a USDG lender vault, repaid automatically from a share of their future fees.
- **It runs on Robinhood Chain.** It's a long-term company, so write code you'd be comfortable having audited and maintained for years.

## 2. Repository map

| Path | Contents |
|---|---|
| `packages/contracts/src/UpfrontHook.sol` | Fee taking, splits, daily earnings, claims |
| `packages/contracts/src/UpfrontLauncher.sol` | Pool creation, pool config, first liquidity, ownership |
| `packages/contracts/src/AdvanceDesk.sol` | Offers, payouts, repayment, behind-schedule rule |
| `packages/contracts/src/LenderVault.sol` | ERC-4626 USDG vault |
| `packages/contracts/src/RevenueMath.sol` | Pure maths: buckets, weakest week, offers, schedule |
| `packages/contracts/src/{Errors,Events,Types}.sol` | Shared definitions |
| `packages/contracts/test/` | `unit/`, `fuzz/`, `invariant/`, `fork/` |
| `packages/contracts/script/` | Deploy scripts, including hook salt mining and flag assertion |
| `packages/config/networks.ts` | **The only place** for addresses, chain ids and RPC URLs |
| `packages/indexer/` | Reads chain events for history, charts and totals |
| `packages/web/` | Next.js: website at `/`, app at `/app` |
| `packages/offer-engine/` | Optional Stylus (Rust) offer maths |

## 3. Commands

Keep this section exact once the repo exists. Never invent a command that isn't defined in the project.

```bash
# contracts
cd packages/contracts
forge build
forge fmt --check
forge test                                   # unit + fuzz
forge test --match-path 'test/invariant/*'   # invariants
forge test --match-path 'test/fork/*' --fork-url $RH_TESTNET_RPC
forge snapshot --check                       # gas
slither .                                    # static analysis

# web
cd packages/web
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

## 4. Hard rules

Breaking any of these is a failed task.

### Product and money
1. **The total fee shown is the total fee charged.** Never add a fee path that isn't in `quoteFee`.
2. **A pool's Upfront fee is fixed at launch and can only be lowered,** never above its max.
3. **Upfront fees are USDG only,** taken on the USDG leg. Pools without USDG are rejected.
4. **Swaps never fail because of Upfront.** No token transfers in swap callbacks; only balance updates. Never revert on `hookData`.
5. **Shares are fixed at launch.** An advance only ever takes from the owner's share.
6. **Pool ownership is locked while an advance is open.**
7. **Admin can't touch swaps, live pools or balances.** Admin powers are exactly those listed in `BUILD_SPEC.md` §4.8, with hard bounds in code.
8. **No upgradeable proxies.** New behaviour means a new version.

### Data
9. **No hardcoded or mock data.**
   - No typed-in stats, sample pools, demo users, mock tokens or fake trades. Not in the UI, seed scripts, fixtures shown to users, or screenshots.
   - Test fixtures live only in test folders and never ship.
10. **Addresses, chain ids and URLs live only in `packages/config/networks.ts`,** copied from `RESOURCES.md` with a source link in a comment.
11. **Tokens are read live** (Robinhood's assets API on mainnet; the explorer API plus the faucet list on testnet). Apply the ERC-8056 multiplier to stock-token amounts.
12. **Honest empty states.** When there's no data, say so and offer the next action.

### Design and words
13. **Follow `DESIGN.md` exactly:**
    - tokens,
    - fonts,
    - motion,
    - the website/app split,
    - text limits,
    - the footer,
    - the logo and favicon rules.
14. **No developer wording in the UI.** Use `DESIGN.md` §6. Never show "hook", "bps", "delta", "tx hash", "revert" or raw errors.
15. **No generic or template styling:** no purple gradients, glassmorphism, glowing orbs, stock illustrations or emoji headings.
16. **Every animation has a reduced-motion version.**

### Repo hygiene
17. **No secrets.** `.env.example` holds names only. Never print, log or commit keys.
18. **No AI attribution anywhere:**
    - no `Co-Authored-By` lines,
    - no "Generated with" footers,
    - no AI names in commits, PRs, the README, `package.json`, code comments, docs, metadata or the website.

    Commit as the repository owner only. The repository owner is the sole author.
19. **Don't add dependencies** without stating why in the PR. Prefer audited libraries (OpenZeppelin, Uniswap periphery). Pin versions.

## 5. Solidity standards

- **Compiler and tooling:** Solidity ^0.8.26, Foundry, `forge fmt`. Custom errors, not revert strings.
- **NatSpec** on every external and public function: what it does, who can call it, and what it emits.
- **Order:** checks → effects → interactions. Reentrancy guards on every external function that moves tokens.
- **Rounding:** fee rounds down; vault maths rounds in the vault's favour. Comment every rounding choice.
- **Units:** USDG has **6 decimals**. Stock tokens have 18. Never mix them without an explicit, tested conversion.
- **Events:** every state change emits one. The indexer and UI depend on them, so never remove or rename an event without a new version.
- **No loops in swap callbacks.** No unbounded loops anywhere users can grow.
- **Immutables over storage** where values never change. Mark constants `constant`.
- **Every `require`-style check maps to a rule** in `BUILD_SPEC.md` §4 or an invariant in `SECURITY.md`, named in a short comment.

## 6. Testing standards

- **Every behaviour change ships with tests.**
- **Every invariant in `SECURITY.md` §2 has an invariant test.** Don't weaken one to make it pass. Fix the code or report.
- **Fuzz dust amounts, max amounts and both swap directions,** with USDG as the specified and the unspecified currency.
- **Write attacker contracts for reentrancy and griefing tests** (payees that revert or re-enter).
- **Fork tests** use the real Robinhood Chain testnet PoolManager, USDG and stock tokens.
- **Gas snapshots** are committed. More than 5% swap overhead growth needs a written reason.
- **Web:** Playwright smoke tests for each route. The launch flow runs end to end on a local fork.

## 7. Frontend standards

- **Stack:** Next.js (App Router), TypeScript strict, wagmi + viem, Motion, Tailwind with `DESIGN.md` tokens as the theme.
- **Contract reads and writes** go through typed hooks generated from ABIs. Never hand-write ABIs.
- **Every async action has four designed states:** idle, pending ("Confirm in your wallet" → "Processing"), success (with a Receipt link) and error (plain reason + next step).
- **Amounts** use Geist Mono with tabular figures, formatted with the user's locale, never more than 2 decimals for USDG on screen.
- **Accessibility:** semantic HTML, labels on every input, a visible focus ring, AA contrast, keyboard-complete flows.
- **Performance:** website Lighthouse 90+; images sized; fonts self-hosted through `next/font`.

## 8. Working process

1. **Plan:** restate the task, the files and the tests.
2. **Build:** small, focused changes. One concern per commit.
3. **Verify:** run every command in §3 that touches your change. All green.
4. **Check against the definition of done** in `BUILD_SPEC.md` §13.
5. **Report back** with:
   - what changed,
   - why,
   - the test results (paste the summary),
   - anything uncertain.

   Never claim something works without having run it.

**Commit messages:** imperative mood, short subject (for example "Add referrer share to fee split"), a body explaining why, and **no AI trailers or footers.**

## 9. When you're unsure

- If the spec is unclear, **stop and ask.** Don't guess on money logic.
- If a rule blocks the task, **report the conflict.** Don't work around it.
- If an address or link isn't in `RESOURCES.md`, **don't invent one.** Ask for it to be verified and added.
- If you find a security issue, **stop and report it privately.** Don't push a quiet fix.

## 10. Common tasks

- **New split party:** extend `Types.sol`, keep I-2, update the invariant tests, the launch form, the FAQ and the README. This requires a new version.
- **Change offer rules:** edit `RevenueMath` and its tests; keep within the hard bounds; update the FAQ and the pool screen text.
- **Add a network:**
  - verify the addresses on-chain,
  - add them to `RESOURCES.md` with sources,
  - then to `networks.ts`,
  - add a fork test.
- **New screen:** design it from `DESIGN.md`, including the empty, loading and error states, before writing logic.
- **Support a fee currency other than USDG:** out of scope for v1. It needs a separate hook version so the USDG guarantee stays intact.

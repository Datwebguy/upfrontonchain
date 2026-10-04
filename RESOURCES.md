# Upfront: resources

Every link and address the build needs, checked on 4 Oct 2026.

- **Addresses marked ✅ on-chain** were confirmed by reading contract code over the network's public RPC.
- **USDG returned `decimals() = 6`** on all three networks.
- A few GitHub and npm pages could not be loaded from the checking environment. They are the official repositories, linked from the official docs.

Copy addresses into `packages/config/networks.ts` with these source links in comments.

---

## Robinhood Chain

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | 46630 ✅ | 4663 ✅ |
| RPC | `https://rpc.testnet.chain.robinhood.com` | `https://rpc.mainnet.chain.robinhood.com` |
| RPC (Alchemy, needs key) | `https://robinhood-testnet.g.alchemy.com/v2/{KEY}` | `https://robinhood-mainnet.g.alchemy.com/v2/{KEY}` |
| Explorer | https://explorer.testnet.chain.robinhood.com | https://robinhoodchain.blockscout.com |
| Explorer API (token search) | `https://explorer.testnet.chain.robinhood.com/api/v2/search?q=TSLA` | `https://robinhoodchain.blockscout.com/api/v2/search?q=TSLA` (blocked from the checking environment; mainnet uses the assets API instead) |
| Faucet (ETH + test stock tokens) | https://faucet.testnet.chain.robinhood.com | — |

**Docs:**
- Connecting: https://docs.robinhood.com/chain/connecting
- Stock tokens: https://docs.robinhood.com/chain/stock-tokens/
- Oracles and price feeds: https://docs.robinhood.com/chain/oracles-and-price-feeds/
- Stock token list API (mainnet, live: 194 tokens, with logos, multipliers and trading status): https://api.robinhood.com/rhj/assets
- Alchemy testnet page: https://www.alchemy.com/rpc/robinhood-testnet

## Uniswap v4

The same addresses are used on Robinhood Chain mainnet and testnet. Source: https://developers.uniswap.org/docs/protocols/v4/deployments

| Contract | Address | Testnet | Mainnet |
|---|---|---|---|
| PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` | ✅ | ✅ |
| PositionManager | `0x58daec3116aae6d93017baaea7749052e8a04fa7` | ✅ | ✅ |
| Universal Router | `0x8876789976decbfcbbbe364623c63652db8c0904` | ✅ | ✅ |
| Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` | ✅ | ✅ |
| StateView | `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` | ✅ | ✅ |
| PositionDescriptor | `0x9639443158e8c5efa35bd45287bf2effd3d8dc06` | — | listed |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | ✅ | ✅ |

**Arbitrum Sepolia (backup network):**
- PoolManager `0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317` ✅
- PositionManager `0xAc631556d3d4019C95769033B5E719dD77124BAc`
- Universal Router `0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47`
- Quoter `0x7de51022d70a725b508085468052e25e22b5c4c9`
- StateView `0x9d467fa9062b6e9b1a46e26007ad82db116c67cb`

**Docs and code:**
- v4 overview: https://docs.uniswap.org/contracts/v4/overview
- Hook deployment (address flags and salt mining): https://docs.uniswap.org/contracts/v4/guides/hooks/hook-deployment
- v4-core: https://github.com/Uniswap/v4-core
- v4-periphery (includes `HookMiner`): https://github.com/Uniswap/v4-periphery
- Hook registry: https://github.com/Uniswap/hooklist
- v4 SDK: https://www.npmjs.com/package/@uniswap/v4-sdk

**OpenZeppelin Uniswap Hooks:**
- Docs: https://docs.openzeppelin.com/uniswap-hooks
- Fee base contracts: https://docs.openzeppelin.com/uniswap-hooks/api/fee
- Code: https://github.com/OpenZeppelin/uniswap-hooks (`forge install OpenZeppelin/uniswap-hooks`)

## USDG (Paxos), 6 decimals

| Network | Token | Check |
|---|---|---|
| Robinhood Chain testnet | `0x7E955252E15c84f5768B83c41a71F9eba181802F` | ✅ code, decimals 6 |
| Robinhood Chain mainnet | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | ✅ code, decimals 6 |
| Arbitrum Sepolia | `0xFFC95faa3d63Cde504a05B567C600B78C0b41892` | ✅ decimals 6 |
| Arbitrum One | `0x004B506865409877C9fA29bfb1ebA929984B9bbC` | from Paxos docs |

**Links:**
- Testnet addresses: https://docs.paxos.com/guides/stablecoin/usdg/testnet
- Mainnet addresses: https://docs.paxos.com/guides/stablecoin/usdg/mainnet
- Test USDG faucet: https://faucet.paxos.com/

## Test stock tokens (Robinhood Chain testnet)

Found through the testnet explorer API. Confirm each in the faucet before use.

| Symbol | Address |
|---|---|
| TSLA | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` |
| AMZN | `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` |
| PLTR | `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0` |
| NFLX | `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` |
| AMD | `0x71178BAc73cBeb415514eB542a8995b82669778d` |

The explorer also lists Edel lending receipt tokens (eTSLA, variableDebtTSLA and so on). Those aren't stock tokens; filter them out.

## Arbitrum

**Official hackathon resources** (from the HackQuest page):
- Get started: https://docs.arbitrum.io/welcome/get-started
- Gentle introduction: https://docs.arbitrum.io/welcome/arbitrum-gentle-introduction
- Solidity quickstart: https://docs.arbitrum.io/build-decentralized-apps/quickstart-solidity-remix
- Oracles: https://docs.arbitrum.io/for-devs/oracles/oracles-content-map
- FAQ: https://docs.arbitrum.io/learn-more/faq
- Stylus quickstart: https://docs.arbitrum.io/stylus/quickstart
- Local Nitro dev node: https://docs.arbitrum.io/run-arbitrum-node/run-nitro-dev-node
- ZeroDev (smart accounts): https://docs.zerodev.app/
- Arbitrum SDK: https://github.com/OffchainLabs/arbitrum-sdk
- Stylus by Example: https://stylus-by-example.org
- Stylus CLI: https://github.com/OffchainLabs/cargo-stylus
- Stylus Rust SDK: https://github.com/OffchainLabs/stylus-sdk-rs
- OpenZeppelin Rust contracts: https://github.com/OpenZeppelin/rust-contracts-stylus

**Faucets:**
- Arbitrum Sepolia ETH: https://arbitrum.faucet.dev/, https://faucet.quicknode.com/arbitrum/sepolia, https://www.l2faucet.com/arbitrum
- Ethereum Sepolia ETH (then bridge): https://sepoliafaucet.com/, https://www.infura.io/faucet/sepolia, https://sepolia-faucet.pk910.de/
- Test USDG: https://faucet.paxos.com/
- Robinhood Chain: https://faucet.testnet.chain.robinhood.com/

**Arbitrum One RPCs:** https://arb1.arbitrum.io/rpc, https://rpc.ankr.com/arbitrum, https://arbitrum.llamarpc.com


- Stylus: https://docs.arbitrum.io/stylus/gentle-introduction
- Bridge: https://bridge.arbitrum.io
- Arbitrum Sepolia explorer: https://sepolia.arbiscan.io
- Arbitrum Sepolia RPC: `https://sepolia-rollup.arbitrum.io/rpc`

## Prices (if needed)

- Chainlink feeds on Robinhood Chain: https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood

## Tools

- Foundry: https://getfoundry.sh · Foundry book: https://book.getfoundry.sh
- Next.js: https://nextjs.org/docs
- wagmi: https://wagmi.sh · viem: https://viem.sh
- Motion (animations): https://motion.dev
- Google Fonts (Bricolage Grotesque, Geist, Geist Mono, Instrument Serif): https://fonts.google.com
- Icons: Lucide, https://lucide.dev

## Hackathon and evidence (README and pitch only, not inside the product)

- HackQuest page: https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon
- Hook census on Robinhood Chain (Bitquery): https://bitquery.io/investigations/uniswap-v4-hooks-robinhood-chain
- Robinhood Chain fees by app (DefiLlama API): https://api.llama.fi/overview/fees/Robinhood
- Early-stage funding data: https://www.kucoin.com/news/flash/crypto-early-stage-funding-drops-50-since-q2-2024-investors-favor-mature-projects
- Revenue-based lending precedent (Credit Coop and Visa): https://cryptobriefing.com/visa-onchain-lending-credit-coop/
- Spigot design (open source) and audit: https://github.com/debtdao/Line-Of-Credit · https://code4rena.com/reports/2022-11-debtdao

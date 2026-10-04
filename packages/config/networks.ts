/**
 * The only place in the repository that holds chain ids, RPC URLs and contract addresses (AGENTS.md rule 10).
 * Every value is copied from RESOURCES.md and was re-checked on-chain on 4 Oct 2026:
 * code present at each address, USDG `decimals() = 6`, and the PositionManager's `poolManager()` and `permit2()`
 * matching the entries below.
 *
 * Upfront's own contract addresses are written here after each deployment. They are `null` until then.
 */

export type Address = `0x${string}`;

export type NetworkKey = "robinhoodTestnet" | "robinhoodMainnet" | "arbitrumSepolia";

export interface UpfrontDeployment {
  hook: Address;
  launcher: Address;
  advanceDesk: Address;
  lenderVault: Address;
  /** Block the hook was deployed in, so the indexer knows where to start. */
  startBlock: number;
}

export interface Network {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  /** Blockscout-style API used to read tokens live on testnets. `null` where the assets API is used instead. */
  explorerApiUrl: string | null;
  faucetUrl: string | null;
  uniswap: {
    poolManager: Address;
    positionManager: Address;
    universalRouter: Address;
    quoter: Address;
    stateView: Address;
    permit2: Address;
  };
  usdg: Address;
  /** USDG has 6 decimals on every network. Stock tokens have 18. */
  usdgDecimals: 6;
  upfront: UpfrontDeployment | null;
}

// Uniswap v4 on Robinhood Chain: the same addresses on testnet and mainnet.
// Source: https://developers.uniswap.org/docs/protocols/v4/deployments
const robinhoodUniswap = {
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
  universalRouter: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
  quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const satisfies Network["uniswap"];

export const networks = {
  robinhoodTestnet: {
    name: "Robinhood Chain testnet",
    chainId: 46630,
    // Source: https://docs.robinhood.com/chain/connecting
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    explorerApiUrl: "https://explorer.testnet.chain.robinhood.com/api/v2",
    faucetUrl: "https://faucet.testnet.chain.robinhood.com",
    uniswap: robinhoodUniswap,
    // Source: https://docs.paxos.com/guides/stablecoin/usdg/testnet
    usdg: "0x7E955252E15c84f5768B83c41a71F9eba181802F",
    usdgDecimals: 6,
    // Deployed with packages/contracts/script/Deploy.s.sol. Record: packages/contracts/deployments/46630.json
    upfront: {
      hook: "0x5CC2a9f05516fBc5B8C52b19BA40E1D111d760CC",
      launcher: "0x2b8b153cA7E6001531770Eeb22ab2dDc81647742",
      advanceDesk: "0x507a1Bf69af37397Aa0273f9BF7dFcf909792b09",
      lenderVault: "0x6B686695f99899f170E34A518395430557b1A663",
      startBlock: 128775924,
    },
  },
  robinhoodMainnet: {
    name: "Robinhood Chain",
    chainId: 4663,
    // Source: https://docs.robinhood.com/chain/connecting
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    // Mainnet tokens come from Robinhood's assets API (https://api.robinhood.com/rhj/assets), not the explorer.
    explorerApiUrl: null,
    faucetUrl: null,
    uniswap: robinhoodUniswap,
    // Source: https://docs.paxos.com/guides/stablecoin/usdg/mainnet
    usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    usdgDecimals: 6,
    upfront: null,
  },
  arbitrumSepolia: {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    // Source: https://docs.arbitrum.io/
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io",
    explorerApiUrl: null,
    faucetUrl: "https://faucet.paxos.com/",
    uniswap: {
      // Source: https://developers.uniswap.org/docs/protocols/v4/deployments
      poolManager: "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317",
      positionManager: "0xAc631556d3d4019C95769033B5E719dD77124BAc",
      universalRouter: "0xeFd1D4bD4cf1e86Da286BB4CB1B8BcED9C10BA47",
      quoter: "0x7dE51022d70A725b508085468052E25e22b5c4c9",
      stateView: "0x9D467FA9062b6e9B1a46E26007aD82db116c67cB",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
    // Source: https://docs.paxos.com/guides/stablecoin/usdg/testnet
    usdg: "0xFFC95faa3d63Cde504a05B567C600B78C0b41892",
    usdgDecimals: 6,
    upfront: null,
  },
} as const satisfies Record<NetworkKey, Network>;

/**
 * Test stock tokens on Robinhood Chain testnet, found through the testnet explorer API.
 * Confirm each against the faucet before use. Lending receipt tokens (eTSLA, variableDebtTSLA and so on) are not
 * stock tokens and must be filtered out wherever tokens are listed.
 * Source: https://explorer.testnet.chain.robinhood.com/api/v2/search?q=TSLA
 */
export const robinhoodTestnetStockTokens = [
  { symbol: "TSLA", address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" },
  { symbol: "AMZN", address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02" },
  { symbol: "PLTR", address: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0" },
  { symbol: "NFLX", address: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93" },
  { symbol: "AMD", address: "0x71178BAc73cBeb415514eB542a8995b82669778d" },
] as const satisfies readonly { symbol: string; address: Address }[];

/** Robinhood's live stock-token list for mainnet. Source: https://api.robinhood.com/rhj/assets */
export const robinhoodAssetsApiUrl = "https://api.robinhood.com/rhj/assets";

/** Where the indexer listens when run locally (`npm start` in packages/indexer). Deployments set their own. */
export const localIndexerUrl = "http://localhost:8787";

/**
 * Links the website and app point to. Kept here with the addresses so no URL is typed anywhere else (AGENTS.md rule 10).
 */
export const links = {
  /** Source: this repository. */
  github: "https://github.com/Datwebguy/upfrontonchain",
  /** Source: README.md. */
  x: "https://x.com/upfrontonchain",
  /** Source: https://developer.x.com/en/docs/x-for-websites/web-intent/overview */
  xShare: "https://x.com/intent/post",
  /** Source: https://docs.robinhood.com/chain/ */
  robinhoodChainDocs: "https://docs.robinhood.com/chain/",
  /** Source: https://docs.paxos.com/guides/stablecoin/usdg/testnet */
  paxosFaucet: "https://faucet.paxos.com/",
} as const;

export function networkByChainId(chainId: number): Network | undefined {
  return Object.values(networks).find((n) => n.chainId === chainId);
}

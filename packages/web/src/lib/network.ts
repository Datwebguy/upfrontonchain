import { defineChain } from "viem";
import { localIndexerUrl, networks, type Network, type NetworkKey, type UpfrontDeployment } from "@config/networks";

/**
 * The one network this build talks to. Everything about it (chain id, RPC, addresses) comes from
 * packages/config/networks.ts. The app never types an address or URL of its own.
 */
const requested = (process.env.NEXT_PUBLIC_NETWORK ?? "robinhoodTestnet") as NetworkKey;
export const networkKey: NetworkKey = requested in networks ? requested : "robinhoodTestnet";
export const network: Network = networks[networkKey];
/**
 * Upfront's own contracts on this network, or null until they are deployed (packages/config/networks.ts).
 * NEXT_PUBLIC_UPFRONT_* exist only to point a local test build at a test deployment on a fork. Never for a real one.
 */
function resolveDeployment(): UpfrontDeployment | null {
  const e = process.env;
  if (e.NEXT_PUBLIC_UPFRONT_HOOK && e.NEXT_PUBLIC_UPFRONT_LAUNCHER && e.NEXT_PUBLIC_UPFRONT_DESK && e.NEXT_PUBLIC_UPFRONT_VAULT) {
    return {
      hook: e.NEXT_PUBLIC_UPFRONT_HOOK as `0x${string}`,
      launcher: e.NEXT_PUBLIC_UPFRONT_LAUNCHER as `0x${string}`,
      advanceDesk: e.NEXT_PUBLIC_UPFRONT_DESK as `0x${string}`,
      lenderVault: e.NEXT_PUBLIC_UPFRONT_VAULT as `0x${string}`,
      startBlock: 0,
    };
  }
  return network.upfront;
}
export const deployment = resolveDeployment();
export const isTestnet = network.faucetUrl !== null;

/** A test build can point at a local fork. A real build always uses the RPC in networks.ts. */
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL_OVERRIDE ?? network.rpcUrl;

export const chain = defineChain({
  id: network.chainId,
  name: network.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: network.explorerUrl } },
});

export const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL ?? localIndexerUrl;

/** A link to a transaction. The app calls it a "Receipt" and never shows the raw hash as the main text. */
export function receiptUrl(txHash: string): string {
  return `${network.explorerUrl}/tx/${txHash}`;
}

export function addressUrl(address: string): string {
  return `${network.explorerUrl}/address/${address}`;
}

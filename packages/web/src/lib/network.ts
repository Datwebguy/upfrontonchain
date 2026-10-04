import { defineChain } from "viem";
import { localIndexerUrl, networks, type NetworkKey, type UpfrontDeployment } from "@config/networks";

/**
 * The one network this build talks to. Everything about it (chain id, RPC, addresses) comes from
 * packages/config/networks.ts. The app never types an address or URL of its own.
 */
const requested = (process.env.NEXT_PUBLIC_NETWORK ?? "robinhoodTestnet") as NetworkKey;
export const networkKey: NetworkKey = requested in networks ? requested : "robinhoodTestnet";
export const network = networks[networkKey];
/** Upfront's own contracts on this network, or null until they are deployed. */
export const deployment = network.upfront as UpfrontDeployment | null;
export const isTestnet = network.faucetUrl !== null;

export const chain = defineChain({
  id: network.chainId,
  name: network.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [network.rpcUrl] } },
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

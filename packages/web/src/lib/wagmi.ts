import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain, rpcUrl } from "./network";

/**
 * Wallet and chain setup. One network, one browser wallet. The wallet is asked to switch to the network when it is
 * on another one (the app shows a banner with a Switch button).
 */
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(rpcUrl) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

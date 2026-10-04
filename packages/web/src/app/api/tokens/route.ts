import type { Address } from "viem";
import { robinhoodAssetsApiUrl, robinhoodTestnetStockTokens } from "@config/networks";
import { network, networkKey } from "@/lib/network";
import type { TokenOption } from "@/lib/tokens";

/**
 * The token list for the launch screen, read live (DESIGN.md §4, BUILD_SPEC §10).
 * Mainnet: Robinhood's assets API. Testnet: the explorer's token data plus the faucet list in networks.ts.
 * Lending receipt tokens are left out, and so is USDG, which is always the other side of the pool.
 * It runs on the server so the browser never has to be allowed to call these APIs.
 */

const REVALIDATE = 300;

/** Edel and Aave receipt and debt tokens (eTSLA, variableDebtTSLA, aStkTSLA) are not stock tokens. */
function isReceiptToken(symbol: string, name: string): boolean {
  return (
    /^(variableDebt|stableDebt|aStk|aEth|e|a)[A-Z]/.test(symbol) && /Edel|Aave|Debt|Receipt|Staked/i.test(`${name} ${symbol}`)
  ) || /\b(Edel|Aave|Variable Debt|Stable Debt)\b/i.test(name);
}

interface ExplorerToken {
  address_hash?: string;
  address?: string;
  symbol?: string | null;
  name?: string | null;
  decimals?: string | null;
  icon_url?: string | null;
  type?: string;
}

function fromExplorer(t: ExplorerToken, verified: boolean): TokenOption | undefined {
  const address = (t.address_hash ?? t.address) as Address | undefined;
  const symbol = t.symbol?.trim();
  if (!address || !symbol || t.decimals == null) return undefined;
  const name = (t.name ?? symbol).trim();
  if (isReceiptToken(symbol, name)) return undefined;
  return { address, symbol, name, decimals: Number(t.decimals), logo: t.icon_url ?? null, multiplier: "1", verified };
}

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function mainnet(q: string): Promise<TokenOption[]> {
  const data = await getJson<{
    assets: {
      tokenSymbol: string;
      tokenName: string;
      tokenDecimals: number;
      logoUrl?: string;
      currentMultiplier?: string;
      status?: string;
      deployments: { contractAddress: string; chainId: number }[];
    }[];
  }>(robinhoodAssetsApiUrl);
  if (!data) return [];
  const out: TokenOption[] = [];
  for (const a of data.assets) {
    const d = a.deployments.find((x) => x.chainId === network.chainId);
    if (!d || (a.status && a.status !== "ASSET_STATUS_ACTIVE")) continue;
    out.push({
      address: d.contractAddress as Address,
      symbol: a.tokenSymbol,
      name: a.tokenName.replace(/ • Robinhood Token$/, ""),
      decimals: a.tokenDecimals,
      logo: a.logoUrl ?? null,
      multiplier: a.currentMultiplier || "1",
      verified: true,
    });
  }
  const needle = q.toLowerCase();
  return out.filter((t) => !needle || t.symbol.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle));
}

async function testnet(q: string): Promise<TokenOption[]> {
  const api = network.explorerApiUrl;
  if (!api) return [];
  const faucet = new Set(robinhoodTestnetStockTokens.map((t) => t.address.toLowerCase()));

  // The faucet tokens come first: they are the ones people can get from the faucet.
  const known = networkKey === "robinhoodTestnet"
    ? (await Promise.all(robinhoodTestnetStockTokens.map((t) => getJson<ExplorerToken>(`${api}/tokens/${t.address}`)))).flatMap((t, i) => {
        const base = robinhoodTestnetStockTokens[i]!;
        const token = t ? fromExplorer({ ...t, address_hash: base.address }, true) : undefined;
        return token ? [token] : [];
      })
    : [];

  const search = await getJson<{ items: ExplorerToken[] }>(`${api}/tokens?type=ERC-20${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const others = (search?.items ?? []).flatMap((t) => {
    const token = fromExplorer(t, faucet.has((t.address_hash ?? "").toLowerCase()));
    return token ? [token] : [];
  });

  const needle = q.toLowerCase();
  const matchingKnown = known.filter((t) => !needle || t.symbol.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle));
  return [...matchingKnown, ...others];
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 40) ?? "";
  const raw = networkKey === "robinhoodMainnet" ? await mainnet(q) : await testnet(q);

  const seen = new Set<string>([network.usdg.toLowerCase()]);
  const tokens: TokenOption[] = [];
  for (const t of raw) {
    const key = t.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(t);
    if (tokens.length >= 40) break;
  }
  return Response.json({ tokens }, { headers: { "cache-control": `public, s-maxage=${REVALIDATE}` } });
}

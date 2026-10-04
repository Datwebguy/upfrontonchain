// End-to-end: a real deployment on a local anvil fork of Robinhood Chain testnet, real swaps, then the indexer.
// The indexer's numbers are checked against what the contracts themselves say on chain.
//
//   eval "$(node ../config/print-env.ts robinhoodTestnet)" && PATH="$HOME/.foundry/bin:$PATH" npm run test:e2e
//
// Skipped when RH_TESTNET_RPC or Foundry is missing. Test fixtures live here only and never ship (AGENTS.md rule 9).
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createPublicClient, encodeAbiParameters, http, keccak256, type Address, type Hex } from "viem";
import { advanceDeskAbi, lenderVaultAbi, upfrontHookAbi } from "../../../config/abis.ts";
import { networks } from "../../../config/networks.ts";
import { route } from "../../src/api.ts";
import { loadConfig } from "../../src/config.ts";
import { openDb } from "../../src/db.ts";
import { syncOnce, type SyncState } from "../../src/sync.ts";

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(here, "../../../contracts");
const forkUrl = process.env.RH_TESTNET_RPC;
const hasFoundry = spawnSync("anvil", ["--version"]).status === 0 && spawnSync("forge", ["--version"]).status === 0;
const skip = !forkUrl || !hasFoundry ? "needs RH_TESTNET_RPC and Foundry (anvil, forge) on PATH" : false;

const PORT = 8599;
const RPC = `http://127.0.0.1:${PORT}`;
const n = networks.robinhoodTestnet;
const SWAPS_PER_DAY = 4;
const DAYS = 5;

let anvil: ChildProcess | undefined;

async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json: any = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

function forge(args: string[], env: Record<string, string>): string {
  const r = spawnSync("forge", args, { cwd: contractsDir, env: { ...process.env, ...env }, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`forge ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

before(async () => {
  if (skip) return;
  anvil = spawn("anvil", ["--fork-url", forkUrl!, "--port", String(PORT), "--silent"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      await rpc("eth_chainId");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("anvil did not start");
});

after(() => {
  anvil?.kill();
});

test("the indexer agrees with the chain after a full launch, trade, advance and repayment", { skip, timeout: 900_000 }, async () => {
  const client = createPublicClient({ transport: http(RPC) });
  const [me, app, referrer, treasury, admin] = (await rpc("eth_accounts")) as Address[];
  assert.ok(me && app && referrer && treasury && admin);

  // Real USDG for the test account. USDG packs balance and shares into one slot (see test/fork).
  const amount = 10n ** 16n;
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [me, 1n]));
  const packed = `0x${(amount | (amount << 64n)).toString(16).padStart(64, "0")}`;
  await rpc("anvil_setStorageAt", [n.usdg, slot, packed]);
  const bal = await client.readContract({
    address: n.usdg,
    abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }],
    functionName: "balanceOf",
    args: [me],
  });
  assert.equal(bal, amount);

  const base: Record<string, string> = {
    POOL_MANAGER: n.uniswap.poolManager,
    POSITION_MANAGER: n.uniswap.positionManager,
    PERMIT2: n.uniswap.permit2,
    USDG: n.usdg,
    TREASURY: treasury,
    ADMIN: admin,
    APP: app,
    REFERRER: referrer,
    DEPLOYMENT_FILE: "deployments/e2e.json",
    ACTIVITY_FILE: "deployments/e2e-activity.json",
  };
  const send = ["--rpc-url", RPC, "--broadcast", "--unlocked", "--sender", me];

  // Deploy with the real deploy script.
  forge(["script", "script/Deploy.s.sol", ...send], base);
  const dep = JSON.parse(readFileSync(join(contractsDir, "deployments/e2e.json"), "utf8"));
  const addrs = {
    HOOK: dep.hook,
    LAUNCHER: dep.launcher,
    DESK: dep.advanceDesk,
    VAULT: dep.lenderVault,
  };
  const env1 = { ...base, ...addrs };

  // Launch a pool and lend.
  forge(["script", "test/e2e/Activity.s.sol", ...send], { ...env1, PHASE: "setup" });
  const act = JSON.parse(readFileSync(join(contractsDir, "deployments/e2e-activity.json"), "utf8"));
  const env2 = { ...env1, TOKEN: act.token, ROUTER: act.router, POOL_ID: act.poolId };
  const poolId = act.poolId as Hex;

  // Five days of steady trading, so the pool has the history an offer needs.
  for (let d = 0; d < DAYS; d++) {
    forge(["script", "test/e2e/Activity.s.sol", ...send], { ...env2, PHASE: "swap", N: String(SWAPS_PER_DAY) });
    await rpc("evm_increaseTime", [86_400]);
    await rpc("evm_mine");
  }
  forge(["script", "test/e2e/Activity.s.sol", ...send], { ...env2, PHASE: "accept" });
  forge(["script", "test/e2e/Activity.s.sol", ...send], { ...env2, PHASE: "repay" });
  forge(["script", "test/e2e/Activity.s.sol", ...send], { ...env2, PHASE: "settle" });

  // Index it.
  const cfg = loadConfig({
    INDEXER_NETWORK: "robinhoodTestnet",
    RPC_URL: RPC,
    UPFRONT_HOOK: addrs.HOOK,
    UPFRONT_LAUNCHER: addrs.LAUNCHER,
    UPFRONT_DESK: addrs.DESK,
    UPFRONT_VAULT: addrs.VAULT,
    START_BLOCK: String(dep.startBlock),
    CONFIRMATIONS: "0",
    MAX_RANGE: "500",
  });
  const db = openDb(":memory:");
  const state: SyncState = {};
  await syncOnce(client, db, cfg, state);
  const get = (path: string) => route(db, cfg, state, new URL(path, "http://x")).body as any;

  // --- pool ---
  const pool = get(`/pools/${poolId}`);
  const chainState: any = await client.readContract({ address: addrs.HOOK, abi: upfrontHookAbi, functionName: "poolState", args: [poolId] });
  const chainConfig: any = await client.readContract({ address: addrs.HOOK, abi: upfrontHookAbi, functionName: "poolConfig", args: [poolId] });
  assert.equal(pool.owner, me.toLowerCase());
  assert.equal(pool.app, app.toLowerCase());
  assert.equal(pool.upfrontFeeBps, chainConfig.upfrontFeeBps);
  assert.deepEqual(pool.shares, { ownerBps: chainConfig.ownerBps, appBps: chainConfig.appBps, referrerBps: chainConfig.referrerBps, protocolBps: chainConfig.protocolBps });
  assert.equal(pool.token, act.token.toLowerCase());
  // The hook's own lifetime counter of the owner's gross earnings equals what the indexer added up from events.
  assert.equal(pool.ownerEarned, chainState.ownerEarned.toString());

  // Every fee the hook took is a trade the indexer saw, and each split sums to its fee.
  assert.ok(pool.trades >= DAYS * SWAPS_PER_DAY + 1, "swaps during repayment were indexed too");
  const trades = get(`/pools/${poolId}/trades?limit=200`).trades;
  assert.equal(trades.length, pool.trades);
  for (const t of trades) {
    const parts = BigInt(t.split.owner) + BigInt(t.split.app) + BigInt(t.split.referrer) + BigInt(t.split.protocol) + BigInt(t.split.repay);
    assert.equal(parts.toString(), t.fee, "split adds up to the fee");
    assert.equal(t.fee, t.quotedFee, "fee charged equals fee shown");
    // The quote the contract gives for the same swap size.
    const chainQuote = await client.readContract({ address: addrs.HOOK, abi: upfrontHookAbi, functionName: "quoteFee", args: [poolId, BigInt(t.usdgAmount)] });
    assert.equal(chainQuote.toString(), t.fee);
  }
  const honest = get("/honest-fees");
  assert.equal(honest.mismatches, 0);
  assert.equal(honest.quoted, honest.charged);

  // --- balances the hook owes, from the events, against what the contract says ---
  const sum = (key: string) => trades.reduce((acc: bigint, t: any) => acc + BigInt(t.split[key]), 0n);
  const claimable = (who: Address) =>
    client.readContract({ address: addrs.HOOK, abi: upfrontHookAbi, functionName: "claimable", args: [who] });
  assert.equal(await claimable(app), sum("app"));
  assert.equal(await claimable(referrer), sum("referrer"));
  assert.equal(await claimable(treasury), sum("protocol"));

  // --- earnings by day add up to the pool total ---
  const days = get(`/pools/${poolId}/earnings?days=60`).days;
  assert.ok(days.length >= DAYS);
  assert.equal(days.reduce((a: bigint, d: any) => a + BigInt(d.ownerEarned), 0n).toString(), pool.ownerEarned);

  // --- the advance, from acceptance to repayment ---
  const advances = get("/lend/advances").advances;
  assert.equal(advances.length, 1);
  const adv = advances[0];
  const rec: any = await client.readContract({ address: addrs.DESK, abi: advanceDeskAbi, functionName: "recordOf", args: [poolId] });
  assert.equal(adv.principal, rec.principal.toString());
  assert.equal(adv.totalDue, rec.totalDue.toString());
  const chainAdv: any = await client.readContract({ address: addrs.HOOK, abi: upfrontHookAbi, functionName: "advanceOf", args: [poolId] });
  const names = (db.prepare("SELECT name FROM events WHERE pool_id = ? ORDER BY id").all(poolId) as { name: string }[]).map((r) => r.name);
  const why = `chain advance: ${JSON.stringify(chainAdv, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}; indexed events: ${names.join(",")}`;
  assert.equal(adv.status, "repaid", why);
  assert.equal(adv.repaid, adv.totalDue, "the pool repaid exactly what was due");
  assert.equal(adv.settled, rec.settled.toString());
  assert.equal(rec.settled, rec.totalDue);

  // --- the vault ---
  const lend = get("/lend/summary");
  assert.equal(lend.deposited, "500000000000");
  assert.equal(lend.withdrawn, "1000000000");
  assert.equal(lend.paidUpfront, adv.principal);
  assert.equal(lend.repaid, adv.totalDue);
  const outstanding = await client.readContract({ address: addrs.VAULT, abi: lenderVaultAbi, functionName: "outstanding" });
  assert.equal(outstanding, 0n);

  // --- totals and health ---
  const t = get("/totals");
  assert.equal(t.pools, 1);
  assert.equal(t.trades, pool.trades);
  assert.equal(t.feesPaidToOwners, pool.ownerEarned);
  assert.equal(t.paidUpfront, adv.principal);
  assert.equal(t.repaid, adv.totalDue);
  const health = get("/health");
  assert.equal(health.deployed, true);
  assert.equal(health.behind, 0);

  // Reading again finds nothing new and changes nothing.
  const again = await syncOnce(client, db, cfg, state);
  assert.equal(again.blocks, 0);
  assert.equal(get("/totals").trades, t.trades);
});

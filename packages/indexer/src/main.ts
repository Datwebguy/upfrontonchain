import { startServer } from "./api.ts";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { makeClient, syncOnce, type SyncState } from "./sync.ts";

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const state: SyncState = {};

startServer(db, cfg, state);
console.log(`Indexer for ${cfg.networkKey} (chain ${cfg.chainId}) listening on :${cfg.port}`);

if (!cfg.contracts) {
  console.log("Upfront is not deployed on this network yet. Serving empty results until it is.");
} else {
  const client = makeClient(cfg);
  const loop = async (): Promise<never> => {
    for (;;) {
      try {
        const { blocks, reset } = await syncOnce(client, db, cfg, state);
        if (reset) console.log("Reorg detected: rebuilt from the start block");
        if (blocks > 0) console.log(`Read ${blocks} blocks, now at ${state.indexed}`);
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        console.error("Sync failed, will retry:", state.lastError);
      }
      await new Promise((resolve) => setTimeout(resolve, cfg.pollMs));
    }
  };
  void loop();
}

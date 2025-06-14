
import { MarketMaker } from "./marketMaker";
import { Vault } from "./types";

const vaults: Vault[] = [{
  "baseAssetType": "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  "id": "0x83a4c6f45b8b4088902c0dcea8cab9c9440c3145e3b6438614f7d05daad08e9e",
  "lpTokenType": "0x9d38bc4d25492d7bf10afdedaf67450de14ec4faa6c89131aa3e4f5b2f00e82b::drip::DRIP",
  "quoteAssetType": "0x2::sui::SUI"
}]

async function main() {
  const marketMaker = new MarketMaker(vaults);
  
  process.on("SIGINT", () => {
    console.log("Shutting down market maker...");
    process.exit(0);
  });

  await marketMaker.run();
}

main().catch(console.error);
import dotenv from "dotenv";
import { DeepBookMarketMaker } from "./marketMaker";

dotenv.config({ path: ".env.local" })

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("PRIVATE_KEY not found in environment variables");
    process.exit(1);
  }

  const mm = new DeepBookMarketMaker(privateKey, "mainnet");

  const balances = await mm.suiClient.getAllBalances({ owner: mm.keypair.getPublicKey().toSuiAddress() });

  console.log(String.raw`
    ╭───────────────────────────────────────────────────────────────────────────╮
    │                                                                           │
    │       ___  ___________  ___  ____  ____  __ __    ___   __  _____  ___    │
    │      / _ \/ __/ __/ _ \/ _ )/ __ \/ __ \/ //_/   / _ | /  |/  /  |/  /    │
    │     / // / _// _// ___/ _  / /_/ / /_/ / ,<     / __ |/ /|_/ / /|_/ /     │
    │    /____/___/___/_/  /____/\____/\____/_/|_|   /_/ |_/_/  /_/_/  /_/      │      
    │                                                                           │
    ├───────────────────────────────────────────────────────────────────────────┤ 
    │ Balance of coins owned by this address                                    │
    ├───────────────────────────────────────────────────────────────────────────┤
    │ ╭──────────────────────────────────────╮                                  │
    │ │ coin       balance (raw)  balance    │                                  │
    │ ├──────────────────────────────────────┤                                  │
    │ │                                      │                                  │
    │ │                                      │                                  │
    │ ╰──────────────────────────────────────╯                                  │
    ╰───────────────────────────────────────────────────────────────────────────╯
  `)
};

main();
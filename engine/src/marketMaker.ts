import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bcs } from "@mysten/bcs";
import { config } from "./config";
import { Vault, OrderResult, BalanceInfo } from "./types";

export class MarketMaker {
  private client: SuiClient;
  private keypair: Ed25519Keypair;
  private packageId: string;
  private vaults: Vault[];
  private activeOrders: Map<string, OrderResult> = new Map();

  constructor(vaults: Vault[]) {
    this.client = new SuiClient({ url: config.rpcUrl });
    this.keypair = Ed25519Keypair.fromSecretKey(config.privateKey);
    this.packageId = config.ammPackageId;
    this.vaults = vaults
  }

  generateProof = (vault: Vault) => (tx: Transaction) => {
    return tx.moveCall({
      target: `${this.packageId}::mm_vault::generate_trade_proof`,
      typeArguments: [
        vault.baseAssetType,
        vault.quoteAssetType,
        vault.lpTokenType
      ],
      arguments: [
        tx.object(config.tradeCapId),
        tx.object(vault.id),
      ]
    })
  }

  async createSpreadOrder(vault: Vault): Promise<void> {
    const { baseBalance, quoteBalance} = await this.getBalances(vault);
    const tx = new Transaction();

    const tradeProof = tx.add(this.generateProof(vault));

    const expireTimestamp = Date.now() + config.orderExpiryMs;

    tx.moveCall({
      target: `${this.packageId}::mm_vault::create_spread_order`,
      typeArguments: [
        vault.baseAssetType,
        vault.quoteAssetType,
        vault.lpTokenType
      ],
      arguments: [
        tx.object(vault.id),
        tradeProof,
        tx.object("0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22"),
        tx.pure.u64(10000),     // spread bps
        tx.pure.u64(10000000),  // order size
        tx.pure.u8(0),          // order type
        tx.pure.u64(10),        // max skew percent
        tx.pure.u8(0),          // self matching options
        tx.pure.u64(expireTimestamp),
        tx.object("0x6"),
      ],
    });

    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    console.log("Transaction result:", result.digest);
  }

  async cancelOrder() {

  }

  async getBalances(vault: Vault): Promise<BalanceInfo> {
    const tx = new Transaction();
    
    tx.moveCall({
      target: `${config.ammPackageId}::mm_vault::get_vault_balance`,
      typeArguments: [
        vault.baseAssetType,
        vault.quoteAssetType,
        vault.lpTokenType,
      ],
      arguments: [tx.object(vault.id)]
    });

    const data = await this.client.devInspectTransactionBlock({ 
      transactionBlock: tx, 
      sender: this.keypair.toSuiAddress()
    })

    if (!data?.results?.[0]?.returnValues?.[0]) {
      return { baseBalance: 0, quoteBalance: 0 };
    }

    const returnValues = data.results[0].returnValues;
    
    if (returnValues[0][1] === "u64" &&
      returnValues[1][1] === "u64"
    ) {
      const baseBalanceBytes = new Uint8Array(returnValues[0][0]);
      const baseBalanceString = bcs.u64().parse(baseBalanceBytes);

      const quoteBalanceBytes = new Uint8Array(returnValues[1][0]);
      const quoteBalanceString = bcs.u64().parse(quoteBalanceBytes);

      return { baseBalance: Number(baseBalanceString), quoteBalance: Number(quoteBalanceString) }
    }

    return { baseBalance: 0, quoteBalance: 0 };
  }

  async run(): Promise<void> {
    console.log("Market maker started");
    
    while (true) {
      for (const vault of this.vaults) {
        try {
          const balances = await this.getBalances(vault);
          console.log("Balances:", balances);

          await this.createSpreadOrder(vault);
  
          // const order = await this.createSpreadOrder(vault);
          // console.log("Created order:", order);
          
          // this.activeOrders.set(order.bidOrderId, order);
          // this.activeOrders.set(order.askOrderId, order);
  
          await new Promise(resolve => setTimeout(resolve, config.intervalMs));
        } catch (error) {
          console.error("Error in market maker loop:", error);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
    }
  }
}

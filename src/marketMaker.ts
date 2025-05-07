import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import { DeepBookClient } from "@mysten/deepbook-v3";

import { BalanceManager } from "./types";

const BALANCE_MANAGER_KEY = "SUGOI";

export class DeepBookMarketMaker {
  dbClient: DeepBookClient;
  suiClient: SuiClient;
  keypair: Ed25519Keypair;
  env: "testnet" | "mainnet";

  constructor(privateKey: string, env: "testnet" | "mainnet") {
    this.keypair = this.getSignerFromPK(privateKey);
		this.env = env;
    this.suiClient = new SuiClient({
			url: getFullnodeUrl(env),
		});
		this.dbClient = new DeepBookClient({
			address: this.keypair.toSuiAddress(),
			env: env,
			client: this.suiClient,
		});
  }

  getSignerFromPK = (privateKey: string): Ed25519Keypair => {
		const { schema, secretKey } = decodeSuiPrivateKey(privateKey);
		if (schema === "ED25519") return Ed25519Keypair.fromSecretKey(secretKey);

		throw new Error(`Unsupported schema: ${schema}`);
	};

  async createBalanceManager() {
    let tx = new Transaction();
		tx.add(this.dbClient.balanceManager.createAndShareBalanceManager());

    const res = await this.suiClient.signAndExecuteTransaction({
			transaction: tx,
			signer: this.keypair,
			options: {
				showEffects: true,
				showObjectChanges: true,
			},
		});

    // @ts-ignore
		const balanceManagerAddress = res.objectChanges?.find((change) => {
			return change.type === "created" && change.objectType.includes("BalanceManager");
		})?.["objectId"];

		const balanceManagers: { [key: string]: BalanceManager } = {
			[BALANCE_MANAGER_KEY]: {
				address: balanceManagerAddress,
				tradeCap: undefined,
			},
    };

    this.dbClient = new DeepBookClient({
			address: this.keypair.toSuiAddress(),
			env: this.env,
			client: this.suiClient,
			balanceManagers: balanceManagers,
		});
  }
}
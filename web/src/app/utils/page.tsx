"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSuiClient, ConnectModal, useCurrentAccount, useDisconnectWallet, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

const ammPackageId = process.env.NEXT_PUBLIC_AMM_PACKAGE_ID;

export const VAULTS_STORAGE_KEY = "deepmaker_vaults";
export type VaultData = {
  id: string,
  baseAsset: string,
  quoteAsset: string,
  lpToken: string
}

export default function Utils() {
  if (!ammPackageId) throw new Error("Missing environmental variables");

  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const client = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) => 
      await client.executeTransactionBlock({
				transactionBlock: bytes,
				signature,
				options: {
					showRawEffects: true,
					showObjectChanges: true,
				},
			}),
  });

  const [lpToken, setLpToken] = useState("");
  const [baseAsset, setBaseAsset] = useState("");
  const [quoteAsset, setQuoteAsset] = useState("");
  const [baseAssetPriceId, setBaseAssetPriceId] = useState("");
  const [quoteAssetPriceId, setQuoteAssetPriceId] = useState("");
  const [treasuryCapId, setTreasuryCapId] = useState("");
  const [open, setOpen] = useState(false);
  const [vaultId, setVaultId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createVault = async () => {
    if (!account) {
      setError("Connect your wallet first");
      return;
    }

    if (!lpToken || !baseAsset || !quoteAsset || !baseAssetPriceId || !quoteAssetPriceId || !treasuryCapId) {
      setError("All fields must be filled");
      return;
    }

    setLoading(true);
    setError("");

    const tx = new Transaction();

    tx.moveCall({
      target: `${ammPackageId}::mm_vault::create_vault`,
      typeArguments: [
        baseAsset,
        quoteAsset,
        lpToken,
      ],
      arguments: [
        tx.object(treasuryCapId),
        tx.pure.vector("u8", Array.from(Buffer.from(baseAssetPriceId.slice(2), "hex"))),
        tx.pure.vector("u8", Array.from(Buffer.from(quoteAssetPriceId.slice(2), "hex"))),
      ],
    });

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Vault creation successful:", result);
        const vaultId = result.objectChanges?.find(object => object.type === "created")?.objectId;
        if (vaultId) {
          setVaultId(vaultId);
          saveVault(vaultId);
        }
        
        toast("✅ Vault creation successful")
      },
      onError: (error) => {
        console.error("Vault creation failed:", error);
        setError(error.message);
        toast("❌ Vault creation failed")
      },
    });
  }

  const saveVault = (vaultId: string) => {
    const existingVaults: VaultData[] = JSON.parse(localStorage.getItem(VAULTS_STORAGE_KEY) || "[]");

    const vault: VaultData = {
      id: vaultId,
      baseAsset,
      quoteAsset,
      lpToken
    }

    existingVaults.push(vault)

    localStorage.setItem(VAULTS_STORAGE_KEY, JSON.stringify(existingVaults));
    console.log("Vault saved to storage:", vault);
  }

  return (
    <div className="flex w-screen h-screen items-center justify-center">
      <div className="flex flex-col gap-2">
        {account ? (
            <button 
              className="border rounded py-1 px-2 text-sm"
              onClick={() => {disconnect(); setOpen(false)}}
            >
              Disconnect
            </button>
          ) : (
            <ConnectModal
              trigger={
                <button className="border rounded py-1 px-2 text-sm">Connect</button>
              }
              open={open}
              onOpenChange={(isOpen) => setOpen(isOpen)}
            />
        )}
        <label htmlFor="lpToken" className="text-sm">
          LP Token Type
        </label>
        <input
          id="lpToken"
          type="text"
          onChange={(e) => setLpToken(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="baseAsset" className="text-sm">
          Base Asset Type
        </label>
        <input
          id="baseAsset"
          type="text"
          onChange={(e) => setBaseAsset(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="quoteAsset" className="text-sm">
          Quote Asset Type
        </label>
        <input
          id="quoteAsset"
          type="text"
          onChange={(e) => setQuoteAsset(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="treasuryCap" className="text-sm">
          Treasury Cap Object ID
        </label>
        <input
          id="treasuryCap"
          type="text"
          onChange={(e) => setTreasuryCapId(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="baseAssetPriceId" className="text-sm">
          Base Asset Price ID
        </label>
        <input
          id="baseAssetPriceId"
          type="text"
          onChange={(e) => setBaseAssetPriceId(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="quoteAssetPriceId" className="text-sm">
          Quote Asset Price ID
        </label>
        <input
          id="quotAssetPriceId"
          type="text"
          onChange={(e) => setQuoteAssetPriceId(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />

        <button
          onClick={createVault}
          disabled={loading || !account}
          className="bg-secondary border rounded px-2 py-1 text-sm hover:bg-secondary/80 disabled:hover:bg-secondary"
        >Create</button>

        {vaultId && (
          <pre>{vaultId}</pre>
        )}

        {error && (
          <div className="mt-4 py-1 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!account && (
          <p className="mt-4 text-xs text-white/40">
            Please connect your wallet to continue
          </p>
        )}
      </div>
    </div>
  );
}

/*
example
lpToken: 0x20dfbb342d493c899c0033704d10a46b835b53ab8f501adb13f02098da3d6d9::drip::DRIP
baseAsset: 0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP
quoteAsset: 0x2::sui::SUI
treasurycap: 
base asset priceId: 0x29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff
quote asset priceId: 0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744
*/
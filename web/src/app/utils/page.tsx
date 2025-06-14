"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSuiClient, ConnectModal, useCurrentAccount, useDisconnectWallet, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

const ammPackageId = process.env.NEXT_PUBLIC_AMM_PACKAGE_ID;

export const VAULTS_STORAGE_KEY = "deepmaker_vaults";
export type VaultData = {
  id: string,
  baseAssetType: string,
  quoteAssetType: string,
  lpTokenType: string
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

  const [lpTokenType, setlpTokenType] = useState("");
  const [baseAssetType, setbaseAssetType] = useState("");
  const [quoteAssetType, setquoteAssetType] = useState("");
  const [baseAssetTypePriceId, setbaseAssetTypePriceId] = useState("");
  const [quoteAssetTypePriceId, setquoteAssetTypePriceId] = useState("");
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

    if (!lpTokenType || !baseAssetType || !quoteAssetType || !baseAssetTypePriceId || !quoteAssetTypePriceId || !treasuryCapId) {
      setError("All fields must be filled");
      return;
    }

    setLoading(true);
    setError("");

    const tx = new Transaction();

    const [tradeCap] = tx.moveCall({
      target: `${ammPackageId}::mm_vault::create_vault`,
      typeArguments: [
        baseAssetType,
        quoteAssetType,
        lpTokenType,
      ],
      arguments: [
        tx.object(treasuryCapId),
        tx.pure.vector("u8", Array.from(Buffer.from(baseAssetTypePriceId.slice(2), "hex"))),
        tx.pure.vector("u8", Array.from(Buffer.from(quoteAssetTypePriceId.slice(2), "hex"))),
      ],
    });

    tx.transferObjects([tradeCap], tx.pure.address(account.address));

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Vault creation successful:", result);
        const vaultId = result.objectChanges?.find(object => 
          object.type === "created" &&
          object.objectType === `${ammPackageId}::mm_vault::Vault<${baseAssetType}, ${quoteAssetType}, ${lpTokenType}>`
        // @ts-expect-error idk
        )?.objectId; 
        const tradeCapId = result.objectChanges?.find(object => 
          object.type === "created" &&
          object.objectType === `${ammPackageId}::mm_vault::TradeCap`
        // @ts-expect-error idk
        )?.objectId; 

        if (vaultId && tradeCapId) {
          setVaultId(vaultId);
          saveVault(vaultId);

          console.log("vault id:", vaultId);
          console.log("trade cap id:", tradeCapId);
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
      baseAssetType,
      quoteAssetType,
      lpTokenType
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
        <label htmlFor="lpTokenType" className="text-sm">
          LP Token Type
        </label>
        <input
          id="lpTokenType"
          type="text"
          onChange={(e) => setlpTokenType(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="baseAssetType" className="text-sm">
          Base Asset Type
        </label>
        <input
          id="baseAssetType"
          type="text"
          onChange={(e) => setbaseAssetType(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="quoteAssetType" className="text-sm">
          Quote Asset Type
        </label>
        <input
          id="quoteAssetType"
          type="text"
          onChange={(e) => setquoteAssetType(e.target.value)}
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
        <label htmlFor="baseAssetTypePriceId" className="text-sm">
          Base Asset Price ID
        </label>
        <input
          id="baseAssetTypePriceId"
          type="text"
          onChange={(e) => setbaseAssetTypePriceId(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="quoteAssetTypePriceId" className="text-sm">
          Quote Asset Price ID
        </label>
        <input
          id="quotAssetPriceId"
          type="text"
          onChange={(e) => setquoteAssetTypePriceId(e.target.value)}
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
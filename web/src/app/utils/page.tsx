"use client";

import { useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";

const ammPackageId = process.env.NEXT_PUBLIC_AMM_PACKAGE_ID;
const tokenPackageId = process.env.NEXT_PUBLIC_TOKEN_PACKAGE_ID;

export default function Utils() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [treasuryCapId, setTreasuryCapId] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createVault = async () => {
    if (!account) {
      setError("Connect your wallet first");
      return;
    }

    if (!treasuryCapId) {
      setError("Enter a treasury cap ID");
      return;
    }

    setLoading(true);
    setError("");

    const tx = new Transaction();

    tx.moveCall({
      target: `${ammPackageId}::mm_vault::create_vault`,
      typeArguments: [`${tokenPackageId}::drip::DRIP`],
      arguments: [
        tx.object(treasuryCapId)
      ],
    })

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Vault creation successful: ", result);
        setResult(result);
        toast("✅ Vault creation successful")
      },
      onError: (error) => {
        console.error("Vault creation failed: ", error);
        setError(error.message);
        toast("❌ Vault creation failed")
      },
    });
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
        <button
          onClick={createVault}
          disabled={loading || !account}
          className="bg-secondary border rounded px-2 py-1 text-sm hover:bg-secondary/80"
        >Create</button>

        {result && (
          <pre>{JSON.stringify(result)}</pre>
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
  )
}
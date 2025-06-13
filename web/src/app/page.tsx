"use client"

import { useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { toast } from "sonner";
import { Assets } from "@/components/assets";
import { useOrders } from "@/hooks/useOrders";
import { Button } from "@/components/ui/button"
import { Transaction } from "@mysten/sui/transactions";
import { DepositWithdrawForm } from "@/components/depositWithdrawForm";
import { useRegistrationStatus } from "@/hooks/useRegistrationStatus";
import { useVaultTVL } from "@/hooks/useVaultTVL";
import { usePriceInfoObjectIds } from "@/hooks/usePriceInfoObjectIds";

const ammPackageId = process.env.NEXT_PUBLIC_AMM_PACKAGE_ID;
const tokenPackageId = process.env.NEXT_PUBLIC_TOKEN_PACKAGE_ID;
const vaultId = process.env.NEXT_PUBLIC_VAULT_ID;

const baseAssetType = process.env.NEXT_PUBLIC_BASE_ASSET_TYPE;
const quoteAssetType = process.env.NEXT_PUBLIC_QUOTE_ASSET_TYPE;
const lpTokenType = process.env.NEXT_PUBLIC_LP_TOKEN_TYPE;

const priceIds = [
  process.env.NEXT_PUBLIC_PRICE_ID_SUI_USD,
  process.env.NEXT_PUBLIC_PRICE_ID_DEEP_USD,
].filter((id): id is string => id !== undefined);

export default function Home() {
  if (!ammPackageId || !tokenPackageId || !vaultId || !baseAssetType || !quoteAssetType || !lpTokenType || priceIds.length !== 2) throw new Error("Missing environmental variables");
  
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const { priceInfoObjectIds, loading: priceInfoObjectIdsLoading, error: priceInfoObjectIdsError } = usePriceInfoObjectIds(priceIds);
  const { 
    isRegistered, 
    isLoading: registrationLoading, 
    error: registrationError 
  } = useRegistrationStatus(ammPackageId, baseAssetType, quoteAssetType, lpTokenType, vaultId);
  const { 
    tvl, 
    loading: tvlLoading, 
    error: tvlError 
  } = useVaultTVL(ammPackageId, baseAssetType, quoteAssetType, lpTokenType, vaultId, priceInfoObjectIds || []);
  const orders = useOrders(ammPackageId);
  const [open, setOpen] = useState(false);

  function handleRegister() {
    if (!currentAccount || !baseAssetType || !quoteAssetType || !lpTokenType) return;

    const tx = new Transaction();

    const balanceManager = tx.moveCall({
      target: `0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a::balance_manager::new`,
      arguments: []
    });

    const tradeCap = tx.moveCall({
      target: `0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a::balance_manager::mint_trade_cap`,
      arguments: [balanceManager]
    });

    const depositCap = tx.moveCall({
      target: `0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a::balance_manager::mint_deposit_cap`,
      arguments: [balanceManager]
    });

    const withdrawCap = tx.moveCall({
      target: `0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a::balance_manager::mint_withdraw_cap`,
      arguments: [balanceManager]
    });

    tx.moveCall({
      target: `${ammPackageId}::mm_vault::take_bm`,
      typeArguments: [
        baseAssetType,
        quoteAssetType,
        lpTokenType
      ],
      arguments: [
        tx.object(vaultId!),
        balanceManager,
        tradeCap,
        depositCap,
        withdrawCap
      ]
    });

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Registration successful: ", result);
        toast("✅ Registration successful")
      },
      onError: (error) => {
        console.error("Registration failed: ", error);
        toast("❌ Registration failed")
      },
    });
  }

  return (
    <div className="w-screen h-screen flex justify-center p-16">
      <div className="w-4/5 min-w-3xl flex-col justify-center border rounded-md">
        <div className="h-6 flex px-4 justify-between items-center bg-primary-foreground rounded-t text-xs text-foreground">
          <div className="text-foreground">{currentAccount ? currentAccount.address : "null"}</div>
          {currentAccount ? (
            <button 
              onClick={() => {disconnect(); setOpen(false)}}
            >
              {"> disconnect <"}
            </button>
          ) : (
            <ConnectModal
              trigger={
                <button>{"< connect >"}</button>
              }
              open={open}
              onOpenChange={(isOpen) => setOpen(isOpen)}
            />
          )}
        </div>
        <div className="flex justify-center">
          <pre className="pt-4 pb-8 text-green-500">
            {
              String.raw`   ___  ___________  ___  ____  ____  __ __    ___   __  _____  ___` + "\n" + 
              String.raw`  / _ \/ __/ __/ _ \/ _ )/ __ \/ __ \/ //_/   / _ | /  |/  /  |/  /` + "\n" + 
              String.raw` / // / _// _// ___/ _  / /_/ / /_/ / ,<     / __ |/ /|_/ / /|_/ / ` + "\n" + 
              String.raw`/____/___/___/_/  /____/\____/\____/_/|_|   /_/ |_/_/  /_/_/  /_/  `
            }
        </pre>
        </div>
        <div className="flex flex-col mx-8 border rounded-md p-4 gap-4 bg-primary-foreground shadow">
          <div className="flex justify-between pb-2 border-b font-semibold">
            <h1>VAULT</h1>
            <h1>TVL: ${tvl || 0 / 1_000_000}</h1>
          </div>
          {currentAccount && (
            <div className="flex justify-between items-center p-2 bg-accent rounded-md shadow">
              <div>
                {registrationLoading ? "Loading..." : (isRegistered ? "✅ Registered" : "❌ Not Registered")}
              </div>
              {!isRegistered && !registrationLoading && (
                <Button variant="outline" onClick={handleRegister} size="sm">
                  Register BalanceManager
                </Button>
              )}
            </div>
          )}

          <div className="flex w-full gap-4">
            <div className="w-1/2 bg-accent rounded-md py-2 px-3 shadow">
              <DepositWithdrawForm
                ammPackageId={ammPackageId} 
                baseAssetType={baseAssetType}
                quoteAssetType={quoteAssetType}
                lpTokenType={lpTokenType} 
                vaultId={vaultId} 
                priceIds={priceIds}
              />
            </div>
            <div className="w-1/2 bg-accent rounded-md py-2 px-3 shadow">
              <Assets 
                ammPackageId={ammPackageId} 
                baseAssetType={baseAssetType} 
                quoteAssetType={quoteAssetType} 
                lpTokenType={lpTokenType} 
                vaultId={vaultId}
              />
            </div>
          </div>
          <div className="w-full rounded-md bg-accent p-2 h-[200px] shadow">
            <span className="font-semibold">Trade Log</span>
            <div>
              {orders.data && orders.data.data.map((order, index) => {
                console.log(order)
                return <div key={index}>order</div>
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

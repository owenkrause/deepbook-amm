"use client"

import { useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Asset } from "@/components/asset";
import { useOrders } from "@/hooks/useOrders";
import { Button } from "@/components/ui/button"
import { Transaction } from "@mysten/sui/transactions";
import { DepositWithdrawForm } from "@/components/depositForm";
import { useRegistrationStatus } from "@/hooks/useRegistrationStatus";

export default function Home() {
  const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
  const vaultId = process.env.NEXT_PUBLIC_VAULT_ID;

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const orders = useOrders(packageId!);
  const { isRegistered, loading: registrationLoading, error: registrationError } = useRegistrationStatus();
  const [open, setOpen] = useState(false);

  if (!packageId || !vaultId) return console.error("Environmental variables setup incorrectly");

  function handleRegister() {
    if (!currentAccount) return;

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
      target: `${packageId}::mm_vault::take_bm`,
      typeArguments: ["0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP"],
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
      },
      onError: (error) => {
        console.error("Registration failed: ", error);
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
            <div>VAULT</div>
            <div>TVL: $1,303,245</div>
          </div>
          {currentAccount && (
            <div className="flex justify-between items-center p-2 bg-accent rounded-md shadow">
              <div>
                Registration Status: {registrationLoading ? "Checking..." : (isRegistered ? "✅ Registered" : "❌ Not Registered")}
              </div>
              {!isRegistered && !registrationLoading && (
                <Button onClick={handleRegister} size="sm">
                  Register BalanceManager
                </Button>
              )}
            </div>
          )}

          <div className="flex w-full gap-4 shadow">
            <div className="w-1/2 bg-accent rounded-md p-2">
              <DepositWithdrawForm packageId={packageId} vaultId={vaultId}/>
            </div>
            <div className="w-1/2 bg-accent rounded-md p-2 shadow">
              <h2 className="font-semibold">Asset Balances</h2>
              <Asset packageId={packageId} vaultId={vaultId} coinType={"0x2::sui::SUI"}/>
              <Asset packageId={packageId} vaultId={vaultId} coinType={"0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP"}/>
              <Asset packageId={packageId} vaultId={vaultId} coinType={"0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"}/>
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

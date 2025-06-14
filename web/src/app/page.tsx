"use client"

import { useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { Vault } from "@/components/vault";
import { Accordion } from "@/components/ui/accordion";
import { VAULTS_STORAGE_KEY, VaultData } from "./utils/page";

const ammPackageId = process.env.NEXT_PUBLIC_AMM_PACKAGE_ID;

const priceIds = [
  process.env.NEXT_PUBLIC_PRICE_ID_SUI_USD,
  process.env.NEXT_PUBLIC_PRICE_ID_DEEP_USD,
].filter((id): id is string => id !== undefined);

export default function Home() {
  if (!ammPackageId || priceIds.length !== 2) throw new Error("Missing environmental variables");

  const currentAccount = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);

  const vaults: VaultData[] = JSON.parse(localStorage.getItem(VAULTS_STORAGE_KEY) || "[]");

  return (
    <div className="w-screen h-screen flex justify-center p-16">
      <div className="w-4/5 min-w-3xl flex pb-6 flex-col h-full justify-center border rounded-md">
        <div className="h-6 flex px-4 justify-between items-center bg-primary-foreground rounded-t text-xs text-foreground">
          <div className="font-medium text-white/90">{currentAccount ? currentAccount.address : "null"}</div>
          {currentAccount ? (
            <div className="flex gap-4">
              <button 
                className="hover:cursor-pointer font-medium text-white/90"
                onClick={() => {
                  disconnect(); 
                  setOpen(false);
                }}
              >
                DISCONNECT
              </button>
            </div>
          ) : (
            <ConnectModal
              trigger={
                <button className="font-medium text-white/90">CONNECT</button>
              }
              open={open}
              onOpenChange={(isOpen) => setOpen(isOpen)}
            />
          )}
        </div>
        <div className="flex justify-center">
          <pre className="pt-4 pb-8 text-green-500">
            {
              String.raw`   ___  ___________  __  ______   __ _________  ` + "\n" + 
              String.raw`  / _ \/ __/ __/ _ \/  |/  / _ | / //_/ __/ _ \ ` + "\n" + 
              String.raw` / // / _// _// ___/ /|_/ / __ |/ ,< / _// , _/ ` + "\n" + 
              String.raw`/____/___/___/_/  /_/  /_/_/ |_/_/|_/___/_/|_|  `
            }
        </pre>
        </div>
        <div className="flex flex-col flex-1 mx-8 border rounded-md p-4 gap-4 bg-primary-foreground shadow overflow-y-auto">
          <Accordion type="single" collapsible>
            {vaults.map(vault => 
              <Vault 
                key={vault.id}
                ammPackageId={ammPackageId} 
                priceIds={priceIds}
                vaultId={vault.id}
                baseAssetType={vault.baseAssetType}
                quoteAssetType={vault.quoteAssetType}
                lpTokenType={vault.lpTokenType}
              />
            )}
          </Accordion>
        </div>
      </div>
    </div>
  );
}

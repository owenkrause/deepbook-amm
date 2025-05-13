"use client"

import { useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { Asset } from "@/components/asset";

export default function Home() {
  const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
  const vaultId = process.env.NEXT_PUBLIC_VAULT_ID;

  if (!packageId || !vaultId) return console.error("Environmental variables setup incorrectly");

  const currentAccount = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
	const [open, setOpen] = useState(false);

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
        <div className="w-full flex justify-center">
          <pre className="pt-4 text-green-500">
            {
              String.raw`   ___  ___________  ___  ____  ____  __ __    ___   __  _____  ___` + "\n" + 
              String.raw`  / _ \/ __/ __/ _ \/ _ )/ __ \/ __ \/ //_/   / _ | /  |/  /  |/  /` + "\n" + 
              String.raw` / // / _// _// ___/ _  / /_/ / /_/ / ,<     / __ |/ /|_/ / /|_/ / ` + "\n" + 
              String.raw`/____/___/___/_/  /____/\____/\____/_/|_|   /_/ |_/_/  /_/_/  /_/  `
            }
        </pre>
        </div>
        <div>
          <Asset vaultId={vaultId} asset={"SUI"}/>
        </div>
      </div>
    </div>
  );
}

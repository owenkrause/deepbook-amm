import { useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { bcs } from "@mysten/sui/bcs";

export function useVaultBalance(ammPackageId: string, tokenPackageId: string, vaultId: string, coinType: string) {
  const tx = new Transaction();
    
  tx.moveCall({
    target: `${ammPackageId}::mm_vault::get_vault_balance`,
    typeArguments: [
      `${tokenPackageId}::drip::DRIP`,
      coinType
    ],
    arguments: [tx.object(vaultId)]
  });

  const { data, isLoading, error } = useSuiClientQuery("devInspectTransactionBlock", {
    transactionBlock: tx,
    sender: "0x44e12ed495a913b594b5b73c5358b6a6516d4e3742f7a0dcdec12053b6b0aced"
  });

  const balance = useMemo(() => {
    if (!data?.results?.[0]?.returnValues?.[0]) {
      return null;
    }
    
    const returnValue = data.results[0].returnValues[0];
    
    if (returnValue[1] === "u64" && Array.isArray(returnValue[0])) {
      const bytes = new Uint8Array(returnValue[0]);
      const balanceString = bcs.u64().parse(bytes);
      return Number(balanceString);
    }

    return 0;
  }, [data])

  return { balance, isLoading, error };
};
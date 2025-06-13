import { useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { bcs } from "@mysten/sui/bcs";

export function useVaultBalance(
  ammPackageId: string, 
  baseAssetType: string, 
  quoteAssetType: string, 
  lpTokenType: string, 
  vaultId: string, 
) {
  const tx = new Transaction();
    
  tx.moveCall({
    target: `${ammPackageId}::mm_vault::get_vault_balance`,
    typeArguments: [
      baseAssetType,
      quoteAssetType,
      lpTokenType,
    ],
    arguments: [tx.object(vaultId)]
  });

  const { data, isLoading, error } = useSuiClientQuery("devInspectTransactionBlock", {
    transactionBlock: tx,
    sender: "0x44e12ed495a913b594b5b73c5358b6a6516d4e3742f7a0dcdec12053b6b0aced"
  }, {
    queryKey: ["vault-balance", vaultId]
  });

  const balances = useMemo(() => {
    if (!data?.results?.[0]?.returnValues?.[0]) {
      return null;
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

    return { quoteBalance: 0, baseBalance: 0 };
  }, [data])

  return { data: balances, isLoading, error };
};
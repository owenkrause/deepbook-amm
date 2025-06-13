import { useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { bcs } from "@mysten/sui/bcs";

export function useVaultTVL(
  ammPackageId: string, 
  baseAssetType: string, 
  quoteAssetType: string,
  lpTokenType: string,
  vaultId: string,
  priceInfoObjectIds: string[]
) {
  const enabled = Boolean(ammPackageId && vaultId && priceInfoObjectIds?.length == 2);

  const tx = new Transaction();
    
  if (enabled) {
    tx.moveCall({
      target: `${ammPackageId}::mm_vault::get_total_value`,
      typeArguments: [
        baseAssetType,
        quoteAssetType,
        lpTokenType
      ],
      arguments: [
        tx.object(vaultId),
        tx.object(priceInfoObjectIds[1]),
        tx.object(priceInfoObjectIds[0]),
        tx.object("0x6"),
      ]
    });
  }

  const { data, isLoading, error } = useSuiClientQuery("devInspectTransactionBlock", {
    transactionBlock: tx,
    sender: "0x44e12ed495a913b594b5b73c5358b6a6516d4e3742f7a0dcdec12053b6b0aced"
  }, { 
    enabled,
    queryKey: ["vault-tvl", vaultId]
  });

  console.log(data)
  const tvl = useMemo(() => {
    if (!data?.results?.[0]?.returnValues?.[0]) {
      return null;
    }

    const returnValue = data.results[0].returnValues[0];

    if (returnValue[1] === "u256") {
      const bytes = new Uint8Array(returnValue[0]);
      const totalValueString = bcs.u256().parse(bytes);
      return Number(totalValueString);
    }

    return 0;

  }, [data])
  
  return {
    tvl,
    loading: isLoading,
    error: error,
  };
}
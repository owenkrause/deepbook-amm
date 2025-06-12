import { Transaction } from "@mysten/sui/transactions";
import { useSuiClientQuery } from "@mysten/dapp-kit";

export function useVaultTVL(ammPackageId: string, tokenPackageId: string, vaultId: string, priceInfoObjectIds: string[]) {
  const enabled = Boolean(ammPackageId && vaultId && priceInfoObjectIds?.length >= 3);

  const tx = new Transaction();
    
  if (enabled) {
    tx.moveCall({
      target: `${ammPackageId}::mm_vault::get_total_value`,
      typeArguments: [
        `${tokenPackageId}::drip::DRIP`,
      ],
      arguments: [
        tx.object(vaultId),
        tx.object(priceInfoObjectIds[2]),
        tx.object(priceInfoObjectIds[1]),
        tx.object(priceInfoObjectIds[0]),
        tx.object("0x6"),
      ]
    });
  }

  const { data, isLoading, error } = useSuiClientQuery("devInspectTransactionBlock", {
    transactionBlock: tx,
    sender: "0x44e12ed495a913b594b5b73c5358b6a6516d4e3742f7a0dcdec12053b6b0aced"
  });
  
  return {
    data,
    loading: isLoading,
    error: error,
  };
}
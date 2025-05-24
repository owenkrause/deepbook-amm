import { Transaction } from "@mysten/sui/transactions";
import { useSuiClientQuery } from "@mysten/dapp-kit";

export function useVaultTVL(packageID: string, vaultID: string, coinType: string) {

  const tx = new Transaction();
    
  tx.moveCall({
    target: `${packageID}::mm_vault::get_total_value`,
    typeArguments: [
      `0xfd5b64c8eecfa210ba12a786477c7daedf95aa9cc155fc46493ecaf13a1d11f2::drip::DRIP`,
      coinType
    ],
    arguments: [tx.object(vaultID)]
  });

  const { data } = useSuiClientQuery("devInspectTransactionBlock", {
    transactionBlock: tx,
    sender: "0x0bbc599ae81e48d5e67a42c90592109b9ab162d66ec1edef2b305f50015c6228"
  });
  
  return data;
};
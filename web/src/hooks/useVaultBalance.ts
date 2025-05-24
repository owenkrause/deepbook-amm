import { Transaction } from "@mysten/sui/transactions";
import { useSuiClientQuery } from "@mysten/dapp-kit";

export function useVaultBalance(packageID: string, vaultID: string, coinType: string) {

  const tx = new Transaction();
    
  tx.moveCall({
    target: `${packageID}::mm_vault::get_balance`,
    typeArguments: [
      `0xd6cba7469263e9eb6e59a21a724274c70424127dc058c2fc2ba154196d827f82::drip::DRIP`,
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
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

export const useRegistrationStatus = (
  ammPackageId: string, 
  baseAssetType: string, 
  quoteAssetType: string,
  lpTokenType: string,
  vaultId: string
) => {
  const account = useCurrentAccount()

  const tx = new Transaction();
  
  if (account?.address) {
    tx.moveCall({
      target: `${ammPackageId}::mm_vault::is_user_registered`,
      typeArguments: [
        baseAssetType,
        quoteAssetType,
        lpTokenType
      ],
      arguments: [
        tx.object(vaultId),
        tx.pure.address(account.address),
      ]
    });
  }

  const { data, isLoading, error } = useSuiClientQuery("devInspectTransactionBlock", {
    transactionBlock: tx,
    sender: "0x44e12ed495a913b594b5b73c5358b6a6516d4e3742f7a0dcdec12053b6b0aced",
    additionalArgs: { showRawTxnDataAndEffects: true }
  }, {
    enabled: !!account?.address,
    queryKey: ["registration-status", account?.address, vaultId]
  });

  const isRegistered = data?.results?.[0].returnValues?.[0][0][0] === 1;

  return { isRegistered, isLoading, error };
};
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";

export function useUserBalance(coinType: string) {
  const currentAccount = useCurrentAccount();

  return useSuiClientQuery("getBalance", {
    owner: currentAccount?.address!,
    coinType: coinType
  }, { enabled: !!currentAccount?.address })
}
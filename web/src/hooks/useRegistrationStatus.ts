import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useState, useEffect } from "react";

export const useRegistrationStatus = () => {
  const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
  const vaultId = process.env.NEXT_PUBLIC_VAULT_ID;

  const currentAccount = useCurrentAccount();
  const client = useSuiClient();

  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [loading, setloading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const checkRegistration = async () => {
      if (!currentAccount || !packageId || !vaultId) {
        setIsRegistered(false);
        setError(null);
        return;
      }

      setloading(true);
      setError(null);
      
      try {
        const result = await client.getObject({
          id: vaultId,
          options: {
            showContent: true,
          },
        });

        if (result.data?.content?.dataType === "moveObject") {
          const vaultData = result.data.content.fields;
          // @ts-expect-error any type
          const userBalanceManagers = vaultData.user_balance_managers?.fields?.contents || [];
          // @ts-expect-error any type
          const userRegistered = userBalanceManagers.some((entry) => 
            entry.fields.key === currentAccount.address
          );
          
          setIsRegistered(userRegistered);
        } else {
          setIsRegistered(false);
        }
      } catch (err) {
        console.error("Error checking registration:", err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setIsRegistered(false);
      } finally {
        setloading(false);
      }
    };

    checkRegistration();
  }, [currentAccount, client, packageId, vaultId]);

  return {
    isRegistered,
    loading,
    error,
  };
};
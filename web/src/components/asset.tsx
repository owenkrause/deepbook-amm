import Image from "next/image";
import { useVaultBalance } from "@/hooks/useVaultBalance";
import { useCoinMetadata } from "@/hooks/useCoinMetadata";

export function Asset({ ammPackageId, tokenPacakgeId, vaultId, coinType } : { ammPackageId: string, tokenPacakgeId: string, vaultId: string, coinType: string } ) {
  const { balance, isLoading, error} = useVaultBalance(ammPackageId, tokenPacakgeId, vaultId, coinType);
  const coinMetadata = useCoinMetadata(coinType);

  if (!coinMetadata) return;
  
  return (
    <div className="flex items-center justify-between p-2">
      <div className="flex gap-2">
        <Image 
          src={coinMetadata.iconUrl}
          alt="Coin icon"
          width={24}
          height={24}
        />
        <div>{coinMetadata.symbol}</div>
      </div>
      <div>{balance?.toFixed(2) || 0}</div>
    </div>
  );
}
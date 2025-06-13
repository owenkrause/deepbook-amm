import Image from "next/image";
import { useVaultBalance } from "@/hooks/useVaultBalance";
import { useCoinMetadata } from "@/hooks/useCoinMetadata";

type AssetProps = {
  ammPackageId: string;
  baseAssetType: string;
  quoteAssetType: string;
  lpTokenType: string;
  vaultId: string;
}

export function Assets({ ammPackageId, baseAssetType, quoteAssetType, lpTokenType, vaultId }: AssetProps) {
  const { data, isLoading, error} = useVaultBalance(ammPackageId, baseAssetType, quoteAssetType, lpTokenType, vaultId);
  const baseAssetMetadata = useCoinMetadata(baseAssetType);
  const quoteAssetMetadata = useCoinMetadata(quoteAssetType);

  if (!baseAssetMetadata || !quoteAssetMetadata || !data) return null;
  
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">Asset Balances</h2>
      <div className="flex justify-between">
        <div className="flex gap-2">
          <Image 
            src={baseAssetMetadata.iconUrl}
            alt={`${baseAssetMetadata.symbol} icon`}
            width={24}
            height={24}
          />
          <div>{baseAssetMetadata.symbol}</div>
        </div>
        <div>{(data.baseBalance / Math.pow(10, baseAssetMetadata.decimals)).toFixed(2)}</div>
      </div>
      <div className="flex justify-between">
        <div className="flex gap-2">
          <Image 
            src={quoteAssetMetadata.iconUrl}
            alt={`${quoteAssetMetadata.symbol} icon`}
            width={24}
            height={24}
          />
          <div>{quoteAssetMetadata.symbol}</div>
        </div>
        <div>{(data.quoteBalance / Math.pow(10, quoteAssetMetadata.decimals)).toFixed(2)}</div>
      </div>
    </div>
  );
}
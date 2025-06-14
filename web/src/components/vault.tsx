import Image from "next/image";
import { 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Assets } from "./assets";
import { DepositWithdrawForm } from "./depositWithdrawForm";
import { useVaultTVL } from "@/hooks/useVaultTVL";
import { usePriceInfoObjectIds } from "@/hooks/usePriceInfoObjectIds";
import { useCoinMetadata } from "@/hooks/useCoinMetadata";

type VaultProps = {
  ammPackageId: string
  priceIds: string[],
  vaultId: string,
  baseAssetType: string,
  quoteAssetType: string,
  lpTokenType: string
}

export const Vault = ({ ammPackageId, priceIds, vaultId, baseAssetType, quoteAssetType, lpTokenType } : VaultProps) => {
  const { priceInfoObjectIds, loading: priceInfoObjectIdsLoading, error: priceInfoObjectIdsError } = usePriceInfoObjectIds(priceIds);
  const { 
    tvl, 
    loading: tvlLoading, 
    error: tvlError
  } = useVaultTVL(ammPackageId, baseAssetType, quoteAssetType, lpTokenType, vaultId, priceInfoObjectIds || []);
  const baseAssetMetadata = useCoinMetadata(baseAssetType);
  const quoteAssetMetadata = useCoinMetadata(quoteAssetType);

  if (!baseAssetMetadata || !quoteAssetMetadata) return null;

  return (
    <AccordionItem value={vaultId}>
      <AccordionTrigger className="flex items-center justify-between hover:cursor-pointer hover:no-underline">
        <div className="flex gap-4 items-center">
          <div className="flex">
            <Image 
              src={baseAssetMetadata.iconUrl}
              alt={`${baseAssetMetadata.symbol} icon`}
              width={24}
              height={24}
            />
            <Image 
              className="ml-[-8px]"
              src={quoteAssetMetadata.iconUrl}
              alt={`${quoteAssetMetadata.symbol} icon`}
              width={24}
              height={24}
            />
          </div>
          <h3 className="text-base">{`${baseAssetMetadata.symbol} / ${quoteAssetMetadata.symbol}`}</h3>
        </div>
        
      </AccordionTrigger>
      <AccordionContent>
        <div className="flex w-full gap-4">
          <div className="w-1/2 bg-accent rounded-md py-2 px-3 shadow">
            <DepositWithdrawForm
              ammPackageId={ammPackageId} 
              baseAssetType={baseAssetType}
              quoteAssetType={quoteAssetType}
              lpTokenType={lpTokenType} 
              vaultId={vaultId} 
              priceIds={priceIds}
            />
          </div>
          <div className="w-1/2 bg-accent rounded-md py-2 px-3 shadow">
            <Assets 
              ammPackageId={ammPackageId} 
              baseAssetType={baseAssetType} 
              quoteAssetType={quoteAssetType} 
              lpTokenType={lpTokenType} 
              vaultId={vaultId}
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
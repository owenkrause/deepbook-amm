import Image from "next/image";
import { useVaultBalance } from "@/hooks/useVaultBalance";
import { useCoinMetadata } from "@/hooks/useCoinMetadata";

export function Asset(props: { packageID: string, vaultID: string, coinType: string }) {
  const { packageID, vaultID, coinType } = props;

  const balanceData = useVaultBalance(packageID, vaultID, coinType);
  const coinMetadata = useCoinMetadata(coinType);

  if (!coinMetadata) return;
  if (!balanceData?.results?.[0]?.returnValues?.[0]) return;

  const [bytes] = balanceData.results[0].returnValues[0];
  const buffer = new Uint8Array(bytes);
  const view = new DataView(buffer.buffer);
  const balance = view.getBigUint64(0, true);

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
      <div>{balance.toString()}</div>
    </div>
  );
}
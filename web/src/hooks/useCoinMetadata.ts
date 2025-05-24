import { StaticImageData } from "next/image";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import suiImg from "@/assets/sui.png";
import usdcImg from "@/assets/usdc.png";

const ICON_MAP: Record<string, StaticImageData> = {
  SUI: suiImg,
  USDC: usdcImg,
};

export function useCoinMetadata(coinType: string) {
  const { data } = useSuiClientQuery("getCoinMetadata", { coinType })
  if (!data) return;
  return { ...data, iconUrl: data.iconUrl || ICON_MAP[data.symbol]}
}
import { useMemo } from "react";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

export const useTokenPrices = (
  ammPackageId: string,
  priceInfoObjectIds: string[]
) => {
  const isPriceInfoReady = priceInfoObjectIds?.length === 2;
  
  const tx = new Transaction();
  if (isPriceInfoReady) {
    tx.moveCall({
      target: `${ammPackageId}::mm_vault::get_price`,
      arguments: [
        tx.pure.vector("u8", Array.from(Buffer.from("29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff", "hex"))),
        tx.object(priceInfoObjectIds[1]),
        tx.object("0x6")
      ]
    });

    tx.moveCall({
      target: `${ammPackageId}::mm_vault::get_price`,
      arguments: [
        tx.pure.vector("u8", Array.from(Buffer.from("23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744", "hex"))),
        tx.object(priceInfoObjectIds[0]),
        tx.object("0x6")
      ]
    });
  }

  const { data, isLoading, error } = useSuiClientQuery("devInspectTransactionBlock", {
    transactionBlock: tx,
    sender: "0x44e12ed495a913b594b5b73c5358b6a6516d4e3742f7a0dcdec12053b6b0aced",
    additionalArgs: { showRawTxnDataAndEffects: true }
  }, {
    enabled: isPriceInfoReady,
    queryKey: ["token-price"]
  });

  const bytesToSignedInt = (bytes: number[]): bigint => {
    if (!bytes || bytes.length === 0) return BigInt(0);
    
    const isNegative = bytes[0] === 1;
    
    let result = BigInt(0);
    for (let i = 1; i < bytes.length; i++) {
      result |= BigInt(bytes[i]) << (BigInt(i - 1) * BigInt(8));
    }
    
    return isNegative ? -result : result;
  };

  const prices = useMemo(() => {
    if (!data?.results || data.results.length !== 2 || !isPriceInfoReady) {
      return null;
    }
    
    const basePriceResult = data.results[0];
    const quotePriceResult = data.results[1];

    if (!basePriceResult.returnValues || !quotePriceResult.returnValues) {
      return null;
    }

    const basePriceBytes = basePriceResult.returnValues[0][0];
    const baseExpoBytes = basePriceResult.returnValues[1][0];
    
    const quotePriceBytes = quotePriceResult.returnValues[0][0];
    const quoteExpoBytes = quotePriceResult.returnValues[1][0];

    const basePrice = bytesToSignedInt(basePriceBytes);
    const baseExpo = bytesToSignedInt(baseExpoBytes);
    
    const quotePrice = bytesToSignedInt(quotePriceBytes);
    const quoteExpo = bytesToSignedInt(quoteExpoBytes);

    const basePriceNumber = Number(basePrice) * Math.pow(10, Number(baseExpo));
    const quotePriceNumber = Number(quotePrice) * Math.pow(10, Number(quoteExpo));

    return {
      basePrice: basePriceNumber,
      quotePrice: quotePriceNumber,
    };
  }, [data]);

  return { data: prices, isLoading, error };
};
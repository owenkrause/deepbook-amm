import { useState, useEffect } from "react";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { Transaction } from "@mysten/sui/transactions";
import { useSuiClient } from "@mysten/dapp-kit";

export const usePriceInfoObjectIds = (priceIds: string[]) => {
  const [priceInfoObjectIds, setPriceInfoObjectIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  
  const suiClient = useSuiClient();

  useEffect(() => {
    if (!priceIds || priceIds.length !== 3) return;

    const fetchPriceInfoObjectIds = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const connection = new SuiPriceServiceConnection("https://hermes.pyth.network");
        const priceFeedUpdateData = await connection.getPriceFeedsUpdateData(priceIds);
        
        const wormholeStateId = "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";
        const pythStateId = "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
        
        const pythClient = new SuiPythClient(suiClient, pythStateId, wormholeStateId);
        const tx = new Transaction();
        
        const result = await pythClient.updatePriceFeeds(tx, priceFeedUpdateData, priceIds);
        setPriceInfoObjectIds(result);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchPriceInfoObjectIds();
  }, [priceIds, suiClient]);

  return { priceInfoObjectIds, loading, error };
};
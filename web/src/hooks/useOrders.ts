import { useSuiClientQuery } from "@mysten/dapp-kit";

export function useOrders(packageID: string) {
  return useSuiClientQuery("queryEvents", {
    query: {
      MoveEventType: `${packageID}::strategy::OrderCreatedEvent`
    },
    limit: 25,
    order: "descending"
  });
}
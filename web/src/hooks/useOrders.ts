import { useSuiClientQuery } from "@mysten/dapp-kit";

export function useOrders(ammPackageId: string) {
  return useSuiClientQuery("queryEvents", {
    query: {
      MoveEventType: `${ammPackageId}::strategy::OrderCreatedEvent`
    },
    limit: 25,
    order: "descending"
  });
}
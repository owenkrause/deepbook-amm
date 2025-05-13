import { useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

export function Asset(props: { vaultId: string, asset: string }) {
  const { vaultId, asset } = props;

  const { data: vault } = useSuiClientQuery("getObject", { 
    id: vaultId,
    options: { showContent: true },
  })

  const balanceManagerId = vault?.data?.content?.fields?.balance_manager?.fields?.id?.id;
  
  if (!balanceManagerId) return;

  console.log(balanceManagerId)

  let tx = new Transaction()

  tx.moveCall({
    target: "::balance_manager::balance",
    typeArguments: ["0x2::sui::SUI"],
    arguments: [tx.object(balanceManagerId)]
  })

  //const { d } = useSuiClientQuery("devInspectTransactionBlock", tx);

  //console.log("vault: ", d);

  return (
    <div>
      
    </div>
  );
}
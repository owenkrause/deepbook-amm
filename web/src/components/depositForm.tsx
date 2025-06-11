import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"

import { usePriceInfoObjectIds } from "@/hooks/usePriceInfoObjectIds";
import { useRegistrationStatus } from "@/hooks/useRegistrationStatus";
import { useUserBalance } from "@/hooks/useUserBalance";

const formSchema = z.object({
  type: z.enum(["deposit", "withdraw"]),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than zero."),
})

const priceIds = [
  "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744", // SUI / USD
  "0x29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff", // DEEP / USD
  "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a", // USDC / USD
];

export const DepositWithdrawForm = ({ packageId, vaultId }: { packageId: string, vaultId: string }) => {
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { isRegistered, loading: registrationLoading, error: registrationError } = useRegistrationStatus()
  const { priceInfoObjectIds, loading: priceInfoObjectIdsLoading, error: priceInfoObjectIdsError } = usePriceInfoObjectIds(priceIds);

  const deep_balance = useUserBalance("0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP");
  const lp_balance = useUserBalance("0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "deposit",
      amount: 0.0
    },
  })

  const isPriceInfoReady = priceInfoObjectIds && priceInfoObjectIds.length >= 3;

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (values.type === "deposit") {
      handleDeposit(values.amount);
    } else {
      handleWithdraw(values.amount);
    }
  }

  function handleDeposit(amount: number) {
    if (!currentAccount || !isPriceInfoReady) return

    const deposit = coinWithBalance({ 
      type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
      balance: amount * 1_000_000
    })

    const tx = new Transaction();

    tx.setSenderIfNotSet(currentAccount.address);

    const lpTokens = tx.moveCall({
      target: `${packageId}::mm_vault::deposit`,
      typeArguments: ["0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP"],
      arguments: [
        tx.object(vaultId!),
        tx.object(deposit),
        tx.object(priceInfoObjectIds[0]),
        tx.object(priceInfoObjectIds[1]),
        tx.object(priceInfoObjectIds[2]),
        tx.object("0x6")
      ]
    })

    tx.transferObjects([lpTokens], currentAccount.address);

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Deposit successful: ", result);
      },
      onError: (error) => {
        console.error("Deposit failed: ", error);
      },
    });
  }

  function handleWithdraw(amount: number) {
    if (!currentAccount || !isRegistered || !isPriceInfoReady) return;

    const lpCoin = coinWithBalance({ 
      type: "0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP",
      balance: amount * 1_000_000_000
    });

    const tx = new Transaction();

    tx.setSenderIfNotSet(currentAccount.address);

    const deepTokens = tx.moveCall({
      target: `${packageId}::mm_vault::withdraw`,
      typeArguments: ["0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP"],
      arguments: [
        tx.object(vaultId!),
        tx.object(lpCoin),
        tx.object(priceInfoObjectIds[0]),
        tx.object(priceInfoObjectIds[1]),
        tx.object(priceInfoObjectIds[2]),
        tx.object("0x6")
      ]
    });

    tx.transferObjects([deepTokens], currentAccount.address);

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Withdraw successful: ", result);
        form.reset();
      },
      onError: (error) => {
        console.error("Withdraw failed: ", error);
      },
    });
  }

  const transferType = form.watch("type");

  return (
    <Tabs 
      value={transferType}
      onValueChange={(value) => {
        form.setValue("type", value as "deposit" || "withdraw");
        form.clearErrors();
      }}
    >
      <TabsList className="w-full">
        <TabsTrigger value="deposit">Deposit</TabsTrigger>
        <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
      </TabsList>
      <TabsContent value={transferType}>
        <div>
          {transferType === "deposit" ? "DEEP Balance: " : "DRIP Balance: "}
          {!deep_balance.data || !lp_balance.data ? "--" : (
            transferType === "deposit" ? Number(deep_balance.data.totalBalance) / 1_000_000 : Number(lp_balance.data.totalBalance) / 1_000_000
          )}
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="flex w-full gap-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormControl>
                      <Input 
                        {...field}
                        disabled={!isRegistered || !currentAccount || !isPriceInfoReady}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit"
                disabled={!isRegistered || !currentAccount || !isPriceInfoReady}
              >
                {transferType === "deposit" ? "Deposit" : "Withdraw"}
              </Button>
            </div>
            {priceInfoObjectIdsLoading && (
              <div className="text-sm text-muted-foreground mt-2">
                Loading price feeds...
              </div>
            )}
            {priceInfoObjectIdsError && (
              <div className="text-sm text-red-500 mt-2">
                Error loading price feeds: {priceInfoObjectIdsError.message}
              </div>
            )}
            {!isPriceInfoReady && !priceInfoObjectIdsLoading && !priceInfoObjectIdsError && (
              <div className="text-sm text-muted-foreground mt-2">
                Price feeds not available
              </div>
            )}
          </form>
        </Form>
      </TabsContent>
    </Tabs>
  )
}
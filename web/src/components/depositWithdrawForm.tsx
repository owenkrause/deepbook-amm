import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { toast } from "sonner";
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
import { useUserBalance } from "@/hooks/useUserBalance";
import { useTokenPrices } from "@/hooks/useTokenPrices";

const depositFormSchema = z.object({
  type: z.literal("deposit"),
  baseAmount: z.coerce.number().positive("Base amount must be greater than zero."),
  quoteAmount: z.coerce.number().positive("Quote amount must be greater than zero."),
})

const withdrawFormSchema = z.object({
  type: z.literal("withdraw"),
  lpAmount: z.coerce.number().positive("LP amount must be greater than zero."),
})

const formSchema = z.discriminatedUnion("type", [
  depositFormSchema,
  withdrawFormSchema,
])

type DepositWithdrawFormProps = {
  ammPackageId: string;
  baseAssetType: string;
  quoteAssetType: string;
  lpTokenType: string;
  vaultId: string;
  priceIds: string[];
}

export const DepositWithdrawForm = ({ ammPackageId, baseAssetType, quoteAssetType, lpTokenType, vaultId, priceIds }: DepositWithdrawFormProps) => {
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { priceInfoObjectIds, loading: priceInfoObjectIdsLoading, error: priceInfoObjectIdsError } = usePriceInfoObjectIds(priceIds);

  const { data: baseAssetBalance } = useUserBalance(baseAssetType);
  const { data: quoteAssetBalance } = useUserBalance(quoteAssetType);
  const { data: lpBalance } = useUserBalance(lpTokenType);

  const { 
    data: baseAssetMetadata,
    isLoading: baseAssetMetadataLoading,
    error: baseAssetMetadataError
  } = useSuiClientQuery("getCoinMetadata", { coinType: baseAssetType });
  const { 
    data: quoteAssetMetadata,
    isLoading: quoteAssetMetadataLoading,
    error: quoteAssetMetadataError
  } = useSuiClientQuery("getCoinMetadata", { coinType: quoteAssetType });
  const { 
    data: lpTokenMetadata,
    isLoading: lpTokenMetadataLoading,
    error: lpTokenMetadataError
  } = useSuiClientQuery("getCoinMetadata", { coinType: lpTokenType });

  const { 
    data: priceData,
    isLoading: priceLoading,
    error: priceError
  } = useTokenPrices(ammPackageId, priceInfoObjectIds || []);

  const depositForm = useForm<z.infer<typeof depositFormSchema>>({
    resolver: zodResolver(depositFormSchema),
    defaultValues: {
      type: "deposit",
      baseAmount: 0,
      quoteAmount: 0,
    },
  })

  const withdrawForm = useForm<z.infer<typeof withdrawFormSchema>>({
    resolver: zodResolver(withdrawFormSchema),
    defaultValues: {
      type: "withdraw",
      lpAmount: 0,
    },
  })

  const isPriceInfoReady = priceInfoObjectIds && priceInfoObjectIds.length == 2;
  if (
    !lpTokenMetadata || !baseAssetMetadata || !quoteAssetMetadata || 
    !priceData || !isPriceInfoReady || !baseAssetBalance || !quoteAssetBalance || !lpBalance
  ) return null;

  function onDepositSubmit(values: z.infer<typeof depositFormSchema>) {
    handleDeposit(values.baseAmount, values.quoteAmount);
  }

  function onWithdrawSubmit(values: z.infer<typeof withdrawFormSchema>) {
    handleWithdraw(values.lpAmount);
  }

  function handleDeposit(baseAmount: number, quoteAmount: number) {
    if (!currentAccount || !isPriceInfoReady || !baseAssetMetadata || !quoteAssetMetadata) return;

    const baseDeposit = coinWithBalance({ 
      type: baseAssetType,
      balance: baseAmount * Math.pow(10, baseAssetMetadata.decimals)
    });

    const quoteDeposit = coinWithBalance({
      type: quoteAssetType,
      balance: quoteAmount * Math.pow(10, quoteAssetMetadata.decimals)
    });

    const tx = new Transaction();

    tx.setSenderIfNotSet(currentAccount.address);

    const lpTokens = tx.moveCall({
      target: `${ammPackageId}::mm_vault::deposit`,
      typeArguments: [
        baseAssetType,
        quoteAssetType,
        lpTokenType
      ],
      arguments: [
        tx.object(vaultId),
        tx.object(baseDeposit),
        tx.object(quoteDeposit),
        tx.object(priceInfoObjectIds[1]),
        tx.object(priceInfoObjectIds[0]),
        tx.object("0x6")
      ]
    });

    tx.transferObjects([lpTokens], currentAccount.address);

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Deposit successful: ", result);
        depositForm.reset();
        toast("✅ Deposit successful")
      },
      onError: (error) => {
        console.error("Deposit failed: ", error);
        toast("❌ Deposit failed")
      },
    });
  }

  function handleWithdraw(amount: number) {
    if (!currentAccount || !isPriceInfoReady || !lpTokenMetadata) return;

    const lpCoin = coinWithBalance({ 
      type: lpTokenType,
      balance: amount * Math.pow(10, lpTokenMetadata.decimals)
    });

    const tx = new Transaction();

    tx.setSenderIfNotSet(currentAccount.address);

    const [baseTokens, quoteTokens] = tx.moveCall({
      target: `${ammPackageId}::mm_vault::withdraw`,
      typeArguments: [
        baseAssetType,
        quoteAssetType,
        lpTokenType
      ],
      arguments: [
        tx.object(vaultId!),
        tx.object(lpCoin),
      ]
    });

    tx.transferObjects([baseTokens, quoteTokens], currentAccount.address);

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Withdraw successful: ", result);
        withdrawForm.reset();
        toast("✅ Withdraw successful")
      },
      onError: (error) => {
        console.error("Withdraw failed: ", error);
        toast("❌ Withdraw failed")
      },
    });
  }

  const baseAmount = depositForm.watch("baseAmount");
  const quoteAmount = (baseAmount * priceData.basePrice) / priceData.quotePrice
  const quoteAmountRounded = Math.round(quoteAmount * Math.pow(10, quoteAssetMetadata.decimals)) / Math.pow(10, quoteAssetMetadata.decimals)
  depositForm.setValue("quoteAmount", quoteAmountRounded)
  
  return (
    <Tabs defaultValue="deposit">
      <TabsList className="w-full">
        <TabsTrigger value="deposit">Deposit</TabsTrigger>
        <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
      </TabsList>
      <TabsContent value="deposit">
        <div className="pb-2">
          <div className="flex flex-col gap-2">
            <span>
              {`${baseAssetMetadata.symbol} Balance: ${(Number(baseAssetBalance.totalBalance) / Math.pow(10, baseAssetMetadata.decimals)).toFixed(2)}`}
            </span>
            <span>
              {`${quoteAssetMetadata.symbol} Balance: ${(Number(quoteAssetBalance.totalBalance) / Math.pow(10, quoteAssetMetadata.decimals)).toFixed(2)}`}
            </span>
          </div>
        </div>
        <Form {...depositForm}>
          <form onSubmit={depositForm.handleSubmit(onDepositSubmit)} className="flex gap-2 pb-1">
            <FormField
              control={depositForm.control}
              name="baseAmount"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormControl>
                    <Input 
                      {...field}
                      disabled={!currentAccount || !isPriceInfoReady}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit"
              disabled={!currentAccount || !isPriceInfoReady}
            >
              Deposit
            </Button>
          </form>
        </Form>

        <span className="text-white/60 text-xs">{baseAmount} {baseAssetMetadata.symbol} | {quoteAmount.toFixed(2)} {quoteAssetMetadata.symbol}</span>

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
      </TabsContent>

      <TabsContent value="withdraw">
        <div className="pb-2">
          {`${lpTokenMetadata.symbol} Balance: ${(Number(lpBalance.totalBalance) / Math.pow(10, lpTokenMetadata.decimals)).toFixed(2)}`}
        </div>
        <Form {...withdrawForm}>
          <form onSubmit={withdrawForm.handleSubmit(onWithdrawSubmit)} className="flex gap-2">
            <FormField
              control={withdrawForm.control}
              name="lpAmount"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormControl>
                    <Input 
                      {...field}
                      disabled={Number(lpBalance.totalBalance) / Math.pow(10, lpTokenMetadata.decimals) < 1 || !currentAccount || !isPriceInfoReady}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit"
              disabled={Number(lpBalance.totalBalance) / Math.pow(10, lpTokenMetadata.decimals) < 1 || !currentAccount || !isPriceInfoReady}
            >
              Withdraw
            </Button>
          </form>
        </Form>
      </TabsContent>
    </Tabs>
  )
}
"use client"

import { useEffect, useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet, useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Asset } from "@/components/asset";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useOrders } from "@/hooks/useOrders";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";


const formSchema = z.object({
  type: z.enum(["deposit", "withdraw"]),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than zero."),
})

export default function Home() {
  const packageID = process.env.NEXT_PUBLIC_PACKAGE_ID;
  const vaultID = process.env.NEXT_PUBLIC_VAULT_ID;

  if (!packageID || !vaultID) return console.error("Environmental variables setup incorrectly");

  const client = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
	const [open, setOpen] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(false);

  const deep_balance = useUserBalance("0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP");
  const lp_balance = useUserBalance("0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP");

  const [priceInfoObjectIds, setPriceInfoObjectIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchPriceInfo = async () => {
      try {
        const connection = new SuiPriceServiceConnection("https://hermes.pyth.network");
        const priceIDs = [
          "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744", // SUI / USD
          "0x29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff", // DEEP / USD
          "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a", // USDC / USD
        ];

        const priceFeedUpdateData = await connection.getPriceFeedsUpdateData(priceIDs);
        
        const wormholeStateId = "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";
        const pythStateId = "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
        
        const pythClient = new SuiPythClient(client, pythStateId, wormholeStateId);
        const tx = new Transaction();
        
        const objectIds = await pythClient.updatePriceFeeds(tx, priceFeedUpdateData, priceIDs);
        setPriceInfoObjectIds(objectIds);
      } catch (error) {
        console.error("Error fetching price info:", error);
      }
    };

    fetchPriceInfo();
  }, []);

  useEffect(() => {
    const checkRegistration = async () => {
      if (!currentAccount || !packageID || !vaultID) {
        setIsRegistered(false);
        return;
      }

      setIsCheckingRegistration(true);
      try {
        const result = await client.getObject({
          id: vaultID,
          options: {
            showContent: true,
          },
        });

        if (result.data?.content?.dataType === "moveObject") {
          const vaultData = result.data.content.fields as any;
          const userBalanceManagers = vaultData.user_balance_managers?.fields?.contents || [];
          
          const userRegistered = userBalanceManagers.some((entry: any) => 
            entry.fields.key === currentAccount.address
          );
          
          setIsRegistered(userRegistered);
        }
      } catch (error) {
        console.error("Error checking registration:", error);
        setIsRegistered(false);
      } finally {
        setIsCheckingRegistration(false);
      }
    };

    checkRegistration();
  }, [currentAccount, client, packageID, vaultID]);
  
  const orders = useOrders(packageID);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "deposit",
      amount: 0.0
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (values.type === "deposit") {
      handleDeposit(values.amount);
    } else {
      handleWithdraw(values.amount);
    }
  }

  function handleRegister() {
    if (!currentAccount) return;

    const tx = new Transaction();

    const balanceManager = tx.moveCall({
      target: `0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a::balance_manager::new`,
      arguments: []
    });

    const tradeCap = tx.moveCall({
      target: `0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a::balance_manager::mint_trade_cap`,
      arguments: [balanceManager]
    });

    const depositCap = tx.moveCall({
      target: `0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a::balance_manager::mint_deposit_cap`,
      arguments: [balanceManager]
    });

    const withdrawCap = tx.moveCall({
      target: `0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a::balance_manager::mint_withdraw_cap`,
      arguments: [balanceManager]
    });

    tx.moveCall({
      target: `${packageID}::mm_vault::take_bm`,
      typeArguments: ["0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP"],
      arguments: [
        tx.object(vaultID!),
        balanceManager,
        tradeCap,
        depositCap,
        withdrawCap
      ]
    });

    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => {
        console.log("Registration successful: ", result);
        setIsRegistered(true);
      },
      onError: (error) => {
        console.error("Registration failed: ", error);
      },
    });
  }

  function handleDeposit(amount: number) {
    if (!currentAccount) return

    const deposit = coinWithBalance({ 
      type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
      balance: amount * 1_000_000
    })

    const tx = new Transaction();

    tx.setSenderIfNotSet(currentAccount.address);

    const lpTokens = tx.moveCall({
      target: `${packageID}::mm_vault::deposit`,
      typeArguments: ["0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP"],
      arguments: [
        tx.object(vaultID!),
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
    if (!currentAccount || !isRegistered) return;

    const lpCoin = coinWithBalance({ 
      type: "0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP",
      balance: amount * 1_000_000_000
    });

    const tx = new Transaction();

    tx.setSenderIfNotSet(currentAccount.address);

    const deepTokens = tx.moveCall({
      target: `${packageID}::mm_vault::withdraw`,
      typeArguments: ["0x76a8ea947c1211c26e84f535140e50c9c58e6ae0813ee2b44b8339a7f9b0172f::drip::DRIP"],
      arguments: [
        tx.object(vaultID!),
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
    <div className="w-screen h-screen flex justify-center p-16">
      <div className="w-4/5 min-w-3xl flex-col justify-center border rounded-md">
        <div className="h-6 flex px-4 justify-between items-center bg-primary-foreground rounded-t text-xs text-foreground">
          <div className="text-foreground">{currentAccount ? currentAccount.address : "null"}</div>
          {currentAccount ? (
            <button 
              onClick={() => {disconnect(); setOpen(false)}}
            >
              {"> disconnect <"}
            </button>
          ) : (
            <ConnectModal
              trigger={
                <button>{"< connect >"}</button>
              }
              open={open}
              onOpenChange={(isOpen) => setOpen(isOpen)}
            />
          )}
        </div>
        <div className="flex justify-center">
          <pre className="pt-4 pb-8 text-green-500">
            {
              String.raw`   ___  ___________  ___  ____  ____  __ __    ___   __  _____  ___` + "\n" + 
              String.raw`  / _ \/ __/ __/ _ \/ _ )/ __ \/ __ \/ //_/   / _ | /  |/  /  |/  /` + "\n" + 
              String.raw` / // / _// _// ___/ _  / /_/ / /_/ / ,<     / __ |/ /|_/ / /|_/ / ` + "\n" + 
              String.raw`/____/___/___/_/  /____/\____/\____/_/|_|   /_/ |_/_/  /_/_/  /_/  `
            }
        </pre>
        </div>
        <div className="flex flex-col mx-8 border rounded-md p-4 gap-4 bg-primary-foreground">
          <div className="flex justify-between pb-2 border-b">
            <div>VAULT</div>
            <div>TVL: $1,303,245</div>
          </div>
          {currentAccount && (
            <div className="flex justify-between items-center p-2 bg-accent rounded-md">
              <div>
                Registration Status: {isCheckingRegistration ? "Checking..." : (isRegistered ? "✅ Registered" : "❌ Not Registered")}
              </div>
              {!isRegistered && !isCheckingRegistration && (
                <Button onClick={handleRegister} size="sm">
                  Register BalanceManager
                </Button>
              )}
            </div>
          )}

          <div className="flex w-full gap-4 pt-3">
            <div className="w-1/2 bg-accent rounded-md p-2">
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
                                  disabled={!isRegistered || !currentAccount || priceInfoObjectIds.length === 0}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button 
                          type="submit"
                          disabled={!isRegistered || !currentAccount || priceInfoObjectIds.length === 0}
                        >
                          {transferType === "deposit" ? "Deposit" : "Withdraw"}
                        </Button>
                      </div>
                      {priceInfoObjectIds.length === 0 && (
                        <div className="text-sm text-muted-foreground mt-2">
                          Loading price feeds...
                        </div>
                      )}
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </div>
            <div className="w-1/2 bg-accent rounded-md p-2">
              <div>Asset Balances</div>
              <Asset packageID={packageID} vaultID={vaultID} coinType={"0x2::sui::SUI"}/>
              <Asset packageID={packageID} vaultID={vaultID} coinType={"0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP"}/>
              <Asset packageID={packageID} vaultID={vaultID} coinType={"0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"}/>
            </div>
          </div>
          <div className="w-full rounded-md bg-accent p-2 h-[200px]">
            <div>Trade Log</div>
            <div>
              {orders.data && orders.data.data.map((order, index) => {
                console.log(order)
                return <div key={index}>order</div>
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

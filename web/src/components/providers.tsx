"use client"

import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
 
const { networkConfig } = createNetworkConfig({
	testnet: { url: getFullnodeUrl("testnet") },
	mainnet: { url: getFullnodeUrl("mainnet") },
});
const queryClient = new QueryClient();
 
export const Providers = ({ children }: { children: React.ReactNode }) => {
	return (
		<QueryClientProvider client={queryClient}>
			<SuiClientProvider networks={networkConfig} defaultNetwork="mainnet">
				<WalletProvider autoConnect slushWallet={{ name: "DeepMaker" }}>
          {children}
				</WalletProvider>
			</SuiClientProvider>
		</QueryClientProvider>
	);
}
import dotenv from "dotenv";

dotenv.config();

export const config = {
  rpcUrl: process.env.RPC_URL || "https://fullnode.mainnet.sui.io",
  
  ammPackageId: process.env.AMM_PACKAGE_ID!,
  tradeCapId: process.env.TRADE_CAP_ID!,
  poolId: process.env.POOL_ID!,
  balanceManagerId: process.env.BALANCE_MANAGER_ID!,
  deepbookPackageId: process.env.DEEPBOOK_PACKAGE_ID!,
  
  spreadBps: parseInt(process.env.SPREAD_BPS || "1000"),
  orderSize: parseInt(process.env.ORDER_SIZE || "100"),
  maxSkewPercent: parseInt(process.env.MAX_SKEW_PERCENT || "20"),
  orderExpiryMs: parseInt(process.env.ORDER_EXPIRY_MS || "300000"),
  
  intervalMs: parseInt(process.env.INTERVAL_MS || "10000"),
  
  privateKey: process.env.PRIVATE_KEY!,
};
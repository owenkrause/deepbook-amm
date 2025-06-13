# DeepMaker
Decentralized vaults for market-making on [DeepBook](https://deepbook.tech/).


## Problem
DeepBook positions itself as "The Backbone of Sui DeFi Liquidity" - and architecturally, it delivers on this promise. As Sui's native decentralized central limit order book (CLOB), DeepBook provides the infrastructure for transparent, efficient price discovery and trading. Its design enables shared liquidity across the ecosystem, with multiple protocols able to tap into the same order books.
However, despite the robust technical foundation, many trading pairs on DeepBook suffer from illiquidity due to wide bid-ask spreads and limited depth.

## Solution
DeepMaker consists of decentralized vaults that enables users to pool their assets for automated market-making strategies on DeepBook. Users deposit a pair of tokens to receive proportional LP tokens representing their share of the vault. The protocol integrates with DeepBook's balance manager system for efficient capital deployment and uses Pyth Network price feeds to ensure accurate proportions. The vault maintains each user's balance manager with associated trading capabilities and coordinates aggregate liquidity across all participants. LP token holders can withdraw their proportional share of the vault's assets at any time, making it a flexible solution for passive liquidity provision on Sui's native decentralized CLOB.

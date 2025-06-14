module deepbookamm::mm_vault;

use sui::clock::Clock;
use sui::coin::{Coin, TreasuryCap};
use sui::event;
use std::u64::{min, pow};
use deepbook::balance_manager;
use pyth::{pyth, price_info, price_identifier, price, i64};
use pyth::price_info::PriceInfoObject;
use deepbook::pool::{Pool, mid_price, place_limit_order, pool_book_params};
use deepbook::balance_manager::{TradeProof, balance};
use deepbook::order_info::{OrderInfo};

// === Errors ===
const EInvalidID: u64 = 0;
const EWithdrawAmountTooLarge: u64 = 1;
const EMintAmountTooLarge: u64 = 2;
const EOrderSizeTooSmall: u64 = 3;
const EInvalidSpread: u64 = 4;
const EExpiredTimestamp: u64 = 5;
const EInsufficientBaseAsset: u64 = 6;
const EInsufficientQuoteAsset: u64 = 7;
const EUnauthorized: u64 = 8;

/// Event emitted when a deposit or withdrawal occurs
public struct BalanceEvent has copy, drop {
  vault: ID,
  user: address,
  base_asset_amount: u64,
  quote_asset_amount: u64,
  lp_amount: u64, 
  deposit: bool
}

/// Event emitted when an order is created
public struct OrderCreatedEvent has copy, drop {
  user: address,
  spread_bps: u64,
  mid_price: u64,
  bid_price: u64,
  ask_price: u64,
  bid_quantity: u64,
  ask_quantity: u64,
  order_size: u64,
  created_at: u64,
  expires_at: u64
}

/// A shared object that holds funds used by the market maker
public struct Vault<phantom BaseAsset, phantom QuoteAsset, phantom T> has key, store {
  id: UID,
  lp_treasury_cap: TreasuryCap<T>,
  balance_manager: balance_manager::BalanceManager,
  base_price_id: vector<u8>,
  quote_price_id: vector<u8>
}

/// Trading capability
public struct TradingCap has key, store {
  id: UID,
  vault_id: ID,
}

/// Initializes and shares vault object
public fun create_vault<BaseAsset, QuoteAsset, T>(
  lp_treasury_cap: TreasuryCap<T>, 
  base_price_id: vector<u8>,
  quote_price_id: vector<u8>,
  ctx: &mut TxContext
): TradingCap {
  let vault = Vault<BaseAsset, QuoteAsset, T> {
    id: object::new(ctx),
    lp_treasury_cap,
    balance_manager: balance_manager::new(ctx),
    base_price_id,
    quote_price_id
  };

  let vault_id = object::id(&vault);

  sui::transfer::share_object(vault);

  TradingCap {
    id: object::new(ctx),
    vault_id
  }
}

/// Deposits into vault
public fun deposit<BaseAsset, QuoteAsset, T>(
  vault: &mut Vault<BaseAsset, QuoteAsset, T>,
  base_coin: Coin<BaseAsset>,
  quote_coin: Coin<QuoteAsset>,
  base_asset_price_info_object: &PriceInfoObject, 
  quote_asset_price_info_object: &PriceInfoObject,
  clock: &Clock,
  ctx: &mut TxContext,
): Coin<T> {
  let base_deposit_amount = base_coin.value();
  let quote_deposit_amount = quote_coin.value();
  
  let (base_price, base_expo) = get_price(vault.base_price_id, base_asset_price_info_object, clock);
  let (quote_price, quote_expo) = get_price(vault.quote_price_id, quote_asset_price_info_object, clock);
  let normalized_base_price = normalize_price(&base_price, &base_expo);
  let normalized_quote_price = normalize_price(&quote_price, &quote_expo);

  let base_value_scaled = (base_deposit_amount as u256) * normalized_base_price;
  let quote_value_scaled = (quote_deposit_amount as u256) * normalized_quote_price;
  let deposit_value = base_value_scaled + quote_value_scaled;

  let total_lp_supply = vault.lp_treasury_cap.total_supply();
  let lp_tokens_to_mint = if (total_lp_supply == 0) {
    deposit_value
  } else {
    let total_vault_value = get_total_value(
    vault, 
    base_asset_price_info_object, 
    quote_asset_price_info_object, 
    clock
    );
    deposit_value * (total_lp_supply as u256) / total_vault_value
  };

  assert!(lp_tokens_to_mint <= (0xFFFFFFFFFFFFFFFF as u256), EMintAmountTooLarge);

  vault.balance_manager.deposit(base_coin, ctx);
  vault.balance_manager.deposit(quote_coin, ctx);  

  let lp = vault.lp_treasury_cap.mint(lp_tokens_to_mint as u64, ctx);

  event::emit(BalanceEvent {
    vault: object::id(vault),
    user: ctx.sender(),
    base_asset_amount: base_deposit_amount,
    quote_asset_amount: quote_deposit_amount,
    lp_amount: lp_tokens_to_mint as u64,
    deposit: true
  });

  lp
}

/// Withdraws from vault
public fun withdraw<BaseAsset, QuoteAsset, T>(
  vault: &mut Vault<BaseAsset, QuoteAsset, T>,
  lp_coin: Coin<T>,
  ctx: &mut TxContext,
): (Coin<BaseAsset>, Coin<QuoteAsset>) {
  let lp_amount = lp_coin.value();

  let total_lp_supply = vault.lp_treasury_cap.total_supply();

  let (total_base_balance, total_quote_balance) = get_vault_balance(vault);

  let base_to_withdraw = (total_base_balance as u256) * (lp_amount as u256) / (total_lp_supply as u256);
  let quote_to_withdraw = (total_quote_balance as u256) * (lp_amount as u256) / (total_lp_supply as u256);

  assert!(base_to_withdraw <= (0xFFFFFFFFFFFFFFFF as u256), EWithdrawAmountTooLarge);
  assert!(quote_to_withdraw <= (0xFFFFFFFFFFFFFFFF as u256), EWithdrawAmountTooLarge);

  let base_coin = vault.balance_manager.withdraw<BaseAsset>(base_to_withdraw as u64, ctx);
  let quote_coin = vault.balance_manager.withdraw<QuoteAsset>(quote_to_withdraw as u64, ctx);

  vault.lp_treasury_cap.burn(lp_coin);

  event::emit(BalanceEvent {
    vault: object::id(vault),
    user: ctx.sender(),
    base_asset_amount: base_coin.value(),
    quote_asset_amount: quote_coin.value(),
    lp_amount: lp_amount,
    deposit: false,
  });

  (base_coin, quote_coin)
}

/// Generates trade proof
public fun generate_trade_proof<BaseAsset, QuoteAsset, T>(
  _tradeCap: &TradingCap,
  vault: &mut Vault<BaseAsset, QuoteAsset, T>,
  ctx: &TxContext,
): balance_manager::TradeProof {
  assert!(_tradeCap.vault_id == object::id(vault), EUnauthorized);
  balance_manager::generate_proof_as_owner(&mut vault.balance_manager, ctx)
}

/// Gets total balance of base and quote asset
public fun get_vault_balance<BaseAsset, QuoteAsset, T>(vault: &Vault<BaseAsset, QuoteAsset, T>): (u64, u64) {
  (vault.balance_manager.balance<BaseAsset>(), vault.balance_manager.balance<QuoteAsset>())
}

/// Gets total value of vault
public fun get_total_value<BaseAsset, QuoteAsset, T>(
  vault: &Vault<BaseAsset, QuoteAsset, T>, 
  base_asset_price_info_object: &PriceInfoObject,
  quote_asset_price_info_object: &PriceInfoObject, 
  clock: &Clock,
): u256 {
  let (base_price, base_expo) = get_price(vault.base_price_id, base_asset_price_info_object, clock);
  let (quote_price, quote_expo) = get_price(vault.quote_price_id, quote_asset_price_info_object, clock);

  let normalized_base_price = normalize_price(&base_price, &base_expo);
  let normalized_quote_price = normalize_price(&quote_price, &quote_expo);

  let mut total_value: u256 = 0;

  total_value = total_value + (vault.balance_manager.balance<BaseAsset>() as u256) * (normalized_base_price);
  total_value = total_value + (vault.balance_manager.balance<QuoteAsset>() as u256) * (normalized_quote_price);

  total_value
}

/// Gets price of asset
public fun get_price(coin_price_id: vector<u8>, price_info_object: &PriceInfoObject, clock: &Clock): (i64::I64, i64::I64) {
  let max_age = 60;
  let price_struct = pyth::get_price_no_older_than(price_info_object, clock, max_age);
  let price_info = price_info::get_price_info_from_price_info_object(price_info_object);
  let price_id = price_identifier::get_bytes(&price_info::get_price_identifier(&price_info));

  assert!(price_id == coin_price_id, EInvalidID);

  let price = price::get_price(&price_struct);
  let expo = price::get_expo(&price_struct);

  (price, expo)
}

/// Normalizes the price
fun normalize_price(price: &i64::I64, expo: &i64::I64): u256 {
  let price_magnitude = if (price.get_is_negative()) {
    price.get_magnitude_if_negative()
  } else {
    price.get_magnitude_if_positive()
  };

  let expo_magnitude = if (expo.get_is_negative()) {
    expo.get_magnitude_if_negative()
  } else {
    expo.get_magnitude_if_positive()
  };

  let target_expo: u64 = 8;

  let normalized_price = if (expo.get_is_negative()) {
    if (expo_magnitude >= target_expo) {
      let scale_down = pow(10, (expo_magnitude - target_expo) as u8);
      (price_magnitude as u256) / (scale_down as u256)
    } else {
      let scale_up = pow(10, (target_expo - expo_magnitude) as u8);
      (price_magnitude as u256) * (scale_up as u256)
    }
  } else {
    let scale_up = pow(10, (expo_magnitude + target_expo) as u8);
    (price_magnitude as u256) * (scale_up as u256)
  };

  normalized_price
}

/// Places a spread order
public fun create_spread_order<BaseAsset, QuoteAsset, T>(
  vault: &mut Vault<BaseAsset, QuoteAsset, T>,
  trade_proof: &TradeProof,
  pool: &mut Pool<BaseAsset, QuoteAsset>,
  spread_bps: u64,
  order_size: u64,
  order_type: u8,
  max_skew_percent: u64,
  self_matching_option: u8,
  expire_timestamp: u64,
  clock: &Clock,
  ctx: &mut TxContext
): (OrderInfo, OrderInfo) {
  assert!(spread_bps > 0, EInvalidSpread);
  assert!(expire_timestamp > clock.timestamp_ms(), EExpiredTimestamp);

  let (_, lot_size, min_size) = pool_book_params(pool);

  let base_quantity = order_size * lot_size;
  assert!(base_quantity >= min_size, EOrderSizeTooSmall);

  let mid_price = mid_price(pool, clock);

  let base_balance = balance<BaseAsset>(&vault.balance_manager);
  let quote_balance = balance<QuoteAsset>(&vault.balance_manager);

  let base_in_quote = (base_balance as u128) * (mid_price as u128);
  let balanced = base_in_quote == quote_balance as u128;
  let base_heavy = base_in_quote > quote_balance as u128;

  let half_spread = mid_price * spread_bps / 100 / 100 / 2;
  let bid_price = mid_price - half_spread;
  let ask_price = mid_price + half_spread;

  let bid_adjustment: u64;
  let ask_adjustment: u64;
  let imbalance_ratio = 100 * base_in_quote / (quote_balance as u128);

  if (balanced) {
    bid_adjustment = order_size;
    ask_adjustment = order_size;
  } else if (base_heavy) {
    let skew_factor = imbalance_ratio - 100;
    let capped_skew = min(skew_factor as u64, max_skew_percent);

    bid_adjustment = order_size * (100 - capped_skew) / 100;
    ask_adjustment = order_size * (100 + capped_skew) / 100;
  } else {
    let skew_factor = imbalance_ratio - 100;
    let capped_skew = min(skew_factor as u64, max_skew_percent);
  
    bid_adjustment = order_size * (100 + capped_skew) / 100;
    ask_adjustment = order_size * (100 - capped_skew) / 100;
  };

  assert!((ask_adjustment as u128) * (lot_size as u128) <= (base_balance as u128), EInsufficientBaseAsset);
  assert!((bid_adjustment as u128) * (lot_size as u128) <= (quote_balance as u128), EInsufficientQuoteAsset);

  let bid_order = place_limit_order<BaseAsset, QuoteAsset>(
    pool,
    &mut vault.balance_manager,
    trade_proof,
    0,
    order_type,
    self_matching_option,
    bid_price,
    bid_adjustment,
    true,
    false,
    expire_timestamp,
    clock,
    ctx
  );

  let ask_order = place_limit_order<BaseAsset, QuoteAsset>(
    pool,
    &mut vault.balance_manager,
    trade_proof,
    0,
    order_type,
    self_matching_option,
    ask_price,
    ask_adjustment,
    false,
    false,
    expire_timestamp,
    clock,
    ctx
  );

  event::emit(OrderCreatedEvent {
    user: ctx.sender(),
    spread_bps,
    mid_price,
    bid_price,
    ask_price,
    bid_quantity: bid_adjustment,
    ask_quantity: ask_adjustment,
    order_size,
    created_at: clock.timestamp_ms(),
    expires_at: expire_timestamp,
  });

  (bid_order, ask_order)
}
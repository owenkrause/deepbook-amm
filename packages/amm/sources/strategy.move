module deepbookamm::strategy;

use std::u64::min;
use sui::clock::Clock;
use sui::event;
use deepbook::pool::{Pool, mid_price, place_limit_order, pool_book_params};
use deepbook::balance_manager::{BalanceManager, TradeProof, balance};
use deepbook::order_info::{OrderInfo};

// === Errors ===
const EOrderSizeTooSmall: u64 = 0;
const EInvalidSpread: u64 = 4;
const EExpiredTimestamp: u64 = 5;
const EInsufficientBaseAsset: u64 = 6;
const EInsufficientQuoteAsset: u64 = 7;

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

/// Places a spread order
public fun create_spread_order<BaseAsset, QuoteAsset>(
  balance_manager: &mut BalanceManager,
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

  let (_tick_size, lot_size, min_size) = pool_book_params(pool);

  let base_quantity = order_size * lot_size;
  assert!(base_quantity >= min_size, EOrderSizeTooSmall);

  let mid_price = mid_price(pool, clock);

  let base_balance = balance<BaseAsset>(balance_manager);
  let quote_balance = balance<QuoteAsset>(balance_manager);

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
    balance_manager,
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
    balance_manager,
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
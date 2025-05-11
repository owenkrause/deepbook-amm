module deepbookamm::trade;

use sui::clock::Clock;
use deepbook::pool::{Pool, mid_price, place_limit_order, pool_book_params};
use deepbook::balance_manager::{BalanceManager, TradeProof, balance};
use deepbook::order_info::{OrderInfo};

// === Errors ===
const EOrderSizeTooSmall: u64 = 0;
const EInvalidSpread: u64 = 4;
const EExpiredTimestamp: u64 = 5;
const EInsufficientBaseAsset: u64 = 6;
const EInsufficientQuoteAsset: u64 = 7;

/// Places a spread order
public fun create_spread_order<BaseAsset, QuoteAsset>(
  balance_manager: &mut BalanceManager,
  trade_proof: &TradeProof,
  pool: &mut Pool<BaseAsset, QuoteAsset>,
  spread_bps: u64,
  order_size: u64,
  order_type: u8,
  skew_percent: u64,
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

  let base_in_quote = base_balance * mid_price;
  let base_heavy = base_in_quote > quote_balance;

  let half_spread = (mid_price * spread_bps) / 10000 / 2;
  let bid_price = mid_price - half_spread;
  let ask_price = mid_price + half_spread;

  let bid_adjustment: u64;
  let ask_adjustment: u64;

  if (base_heavy) {
    bid_adjustment = order_size * (100 - skew_percent) / 100;
    ask_adjustment = order_size * (100 + skew_percent) / 100;
  } else {
    bid_adjustment = order_size * (100 + skew_percent) / 100;
    ask_adjustment = order_size * (100 - skew_percent) / 100;
  };

  assert!(ask_adjustment * lot_size <= base_balance, EInsufficientBaseAsset);
  assert!(bid_adjustment * lot_size * bid_price <= quote_balance, EInsufficientQuoteAsset);

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
    true,
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
    true,
    expire_timestamp,
    clock,
    ctx
  );

  (bid_order, ask_order)
}
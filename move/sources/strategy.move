module deepbookamm::strategy;

use deepbookamm::vault::{Vault, balance_manager};
use sui::clock::Clock;
use deepbook::pool::{Pool, mid_price, place_limit_order, pool_book_params};
use deepbook::balance_manager::{TradeProof};
use deepbook::order_info::{OrderInfo};

// === Errors ===
const EOrderSizeTooSmall: u64 = 0;
const EInvalidSpread: u64 = 4;
const EExpiredTimestamp: u64 = 5;

/// Places a spread order
public fun create_spread_order<BaseAsset, QuoteAsset>(
  vault: &mut Vault,
  trade_proof: &TradeProof,
  pool: &mut Pool<BaseAsset, QuoteAsset>,
  spread_bps: u64,
  order_size: u64,
  order_type: u8,
  self_matching_option: u8,
  expire_timestamp: u64,
  clock: &Clock,
  ctx: &mut TxContext
): (OrderInfo, OrderInfo) {
  assert!(spread_bps > 0, EInvalidSpread);
  assert!(expire_timestamp > clock.timestamp_ms(), EExpiredTimestamp);

  let (tick_size, lot_size, min_size) = pool_book_params(pool);

  let base_quantity = order_size * lot_size;
  assert!(base_quantity >= min_size, EOrderSizeTooSmall);

  let balance_manager = balance_manager(vault);

  let mid_price = mid_price(pool, clock);
  let half_spread = (mid_price * spread_bps) / 10000 / 2;

  let bid_price = mid_price - half_spread;
  let ask_price = mid_price + half_spread;

  let bid_order = place_limit_order<BaseAsset, QuoteAsset>(
    pool, 
    balance_manager, 
    trade_proof, 
    0,
    order_type, 
    self_matching_option, 
    bid_price, 
    order_size, 
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
    order_size, 
    false, 
    true, 
    expire_timestamp, 
    clock, 
    ctx
  );

  (bid_order, ask_order)
}
#[test_only]
module deepbookamm::strategy_tests;

use std::u64::min;
use sui::sui::{SUI};
use sui::coin::mint_for_testing;
use sui::clock::{Self, Clock};
use sui::test_utils;
use sui::test_scenario::{Scenario, begin, end, return_shared, take_shared_by_id};
use token::deep::DEEP;
use deepbook::balance_manager::{Self, BalanceManager, TradeCap};
use deepbook::pool::{Self, Pool};
use deepbook::registry::{Self, Registry};
use deepbook::constants;
use deepbookamm::strategy::{create_spread_order};
use deepbook::pool::place_limit_order;
use deepbook::order_info::{OrderInfo};

public struct USDC has drop, store {}

const OWNER: address = @0x1;

#[test]
fun test_create_spread_order() {
  let mut test = begin(OWNER);

  setup_clock(&mut test);

  test.next_tx(OWNER);
  let registry_id = setup_registry(&mut test);

  let pool_id = setup_pool<SUI, USDC>(
    registry_id,
    constants::tick_size(),
    constants::lot_size(),
    constants::min_size(),
    false,
    false,
    &mut test
  );
  let balance_manager_id = setup_balance_manager<SUI, USDC, DEEP, USDC>(OWNER, 10_000 * constants::float_scaling(), &mut test);
  
  setup_orders<SUI, USDC>(OWNER, pool_id, balance_manager_id, &mut test);

  let order_size = 1 * constants::float_scaling();
  let spread_bps = 1000;
  let max_skew_percent = 25;

  let (bid_order, ask_order) = place_spread_order<SUI, USDC>(
    OWNER,
    balance_manager_id,
    pool_id,
    spread_bps,
    order_size,
    constants::no_restriction(),
    max_skew_percent,
    constants::self_matching_allowed(),
    constants::max_u64(),
    &mut test,
  );

  test.next_tx(OWNER);
  let pool = take_shared_by_id<Pool<SUI, USDC>>(&test, pool_id);
  let clock = test.take_shared<Clock>();
  let mid_price = pool.mid_price(&clock);

  let bid_price = bid_order.price();
  let ask_price = ask_order.price();

  // bid_price = mid_price - (mid_price * spread_bps / 100 / 100 / 2);
  assert!(bid_price == mid_price - (mid_price * 1000) / 100 / 100 / 2, 0);
  assert!(ask_price == mid_price + (mid_price * 1000) / 100 / 100 / 2, 0);

  let spread = ask_price - bid_price;

  // spread = mid_price * spread_bps / 100 / 100
  assert!(spread * 100 * 100 / mid_price == 1000, 0);

  let balance_manager = test.take_shared_by_id<BalanceManager>(balance_manager_id);
  let base_balance = balance_manager.balance<SUI>();
  let quote_balance = balance_manager.balance<USDC>();
  let base_in_quote = (base_balance as u128) * (mid_price as u128);

  let balanced = base_in_quote == quote_balance as u128;
  let base_heavy = base_in_quote > (quote_balance as u128);

  let expected_bid_quantity;
  let expected_ask_quantity;  

  let imbalance_ratio = 100 * base_in_quote / (quote_balance as u128);

  if (balanced) {
    expected_bid_quantity = order_size;
    expected_ask_quantity = order_size;
  } else if (base_heavy) {
    let skew_factor = imbalance_ratio - 100;
    let capped_skew = min(skew_factor as u64, max_skew_percent);

    expected_bid_quantity = order_size * (100 - capped_skew) / 100;
    expected_ask_quantity = order_size * (100 + capped_skew) / 100;
  } else {
    let skew_factor = imbalance_ratio - 100;
    let capped_skew = min(skew_factor as u64, max_skew_percent);

    expected_bid_quantity = order_size * (100 + capped_skew) / 100;
    expected_ask_quantity = order_size * (100 - capped_skew) / 100;
  };

  assert!(bid_order.original_quantity() == expected_bid_quantity, 0);
  assert!(ask_order.original_quantity() == expected_ask_quantity, 0);

  return_shared(balance_manager);
  return_shared(clock);
  return_shared(pool);

  end(test);
}

public(package) fun setup_clock(test: &mut Scenario) {
  test.next_tx(OWNER);
  clock::create_for_testing(test.ctx()).share_for_testing();
}

public(package) fun setup_registry(test: &mut Scenario): ID {
  test.next_tx(OWNER);
  registry::test_registry(test.ctx())
}

public(package) fun setup_pool<BaseAsset, QuoteAsset>(
  registry_id: ID,
  tick_size: u64,
  lot_size: u64,
  min_size: u64,
  whitelisted_pool: bool,
  stable_pool: bool,
  test: &mut Scenario
): ID {
  test.next_tx(OWNER);

  let pool_id;
  let admin_cap = registry::get_admin_cap_for_testing(test.ctx());
  let mut registry = test.take_shared_by_id<Registry>(registry_id);

  {
    pool_id = pool::create_pool_admin<BaseAsset, QuoteAsset>(
      &mut registry,
      tick_size,
      lot_size,
      min_size,
      whitelisted_pool,
      stable_pool,
      &admin_cap,
      test.ctx()
    );
  };

  return_shared(registry);
  test_utils::destroy(admin_cap);

  pool_id
}

public(package) fun setup_balance_manager<
  BaseAsset,
  QuoteAsset,
  ReferenceBaseAsset,
  ReferenceQuoteAsset
>(
  sender: address,
  amount: u64,
  test: &mut Scenario
): ID {
  test.next_tx(sender);
  {
    let mut balance_manager = balance_manager::new(test.ctx());
    balance_manager.deposit<BaseAsset>(mint_for_testing<BaseAsset>(amount, test.ctx()), test.ctx());
    balance_manager.deposit<QuoteAsset>(mint_for_testing<QuoteAsset>(amount, test.ctx()), test.ctx());
    balance_manager.deposit<ReferenceBaseAsset>(mint_for_testing<ReferenceBaseAsset>(amount, test.ctx()), test.ctx());
    balance_manager.deposit<ReferenceQuoteAsset>(mint_for_testing<ReferenceQuoteAsset>(amount, test.ctx()), test.ctx());

    let trade_cap = balance_manager.mint_trade_cap(test.ctx());
    transfer::public_transfer(trade_cap, sender);
    let id = object::id(&balance_manager);
    transfer::public_share_object(balance_manager);

    id
  }
}

public(package) fun setup_orders<BaseAsset, QuoteAsset>(
  trader: address, 
  pool_id: ID, 
  balance_manager_id: ID, 
  test: &mut Scenario
) {
  test.next_tx(trader);
  {
    let clock = test.take_shared<Clock>();
    let mut pool = test.take_shared_by_id<Pool<BaseAsset, QuoteAsset>>(pool_id);
    let mut balance_manager = test.take_shared_by_id<BalanceManager>(balance_manager_id);
    let trade_proof;

    let is_owner = balance_manager.owner() == trader;
    if (is_owner) {
      trade_proof = balance_manager.generate_proof_as_owner(test.ctx());
    } else {
      let trade_cap = test.take_from_sender<TradeCap>();
      trade_proof = balance_manager.generate_proof_as_trader(
        &trade_cap,
        test.ctx(),
      );
      test.return_to_sender(trade_cap);
    };

    pool.place_limit_order<BaseAsset, QuoteAsset>(
      &mut balance_manager,
      &trade_proof,
      0,
      constants::no_restriction(),
      constants::self_matching_allowed(),
      1 * constants::float_scaling(),
      1000 * constants::float_scaling(),
      true,
      false,
      constants::max_u64(),
      &clock,
      test.ctx(),
    );

    pool.place_limit_order<BaseAsset, QuoteAsset>(
      &mut balance_manager,
      &trade_proof,
      0,
      constants::no_restriction(),
      constants::self_matching_allowed(),
      2 * constants::float_scaling(),
      1000 * constants::float_scaling(),
      false,
      false,
      constants::max_u64(),
      &clock,
      test.ctx(),
    );

    return_shared(clock);
    return_shared(pool);
    return_shared(balance_manager);
  };
}

public(package) fun place_spread_order<BaseAsset, QuoteAsset>(
  trader: address,
  balance_manager_id: ID,
  pool_id: ID,
  spread_bps: u64,
  order_size: u64,
  order_type: u8,
  max_skew_percent: u64,
  self_matching_option: u8,
  expire_timestamp: u64,
  test: &mut Scenario
): (OrderInfo, OrderInfo) {
  test.next_tx(trader);
  {
    let clock = test.take_shared<Clock>();
    let mut pool = test.take_shared_by_id<Pool<BaseAsset, QuoteAsset>>(pool_id);
    let mut balance_manager = test.take_shared_by_id<BalanceManager>(balance_manager_id);
    let trade_proof;

    let is_owner = balance_manager.owner() == trader;
    if (is_owner) {
      trade_proof = balance_manager.generate_proof_as_owner(test.ctx());
    } else {
      let trade_cap = test.take_from_sender<TradeCap>();
      trade_proof = balance_manager.generate_proof_as_trader(
        &trade_cap,
        test.ctx(),
      );
      test.return_to_sender(trade_cap);
    };

    let (bid_order, ask_order) = create_spread_order<BaseAsset, QuoteAsset>(
      &mut balance_manager,
      &trade_proof,
      &mut pool,
      spread_bps,
      order_size,
      order_type,
      max_skew_percent,
      self_matching_option,
      expire_timestamp,
      &clock,
      test.ctx()
    );

    return_shared(clock);
    return_shared(pool);
    return_shared(balance_manager);

    (bid_order, ask_order)
  }
}
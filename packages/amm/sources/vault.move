module deepbookamm::mm_vault;

use sui::clock::Clock;
use sui::coin::{Coin, TreasuryCap};
use sui::event;
use std::u64::pow;
use sui::vec_map::{VecMap, Self};
use deepbook::balance_manager;
use pyth::{pyth, price_info, price_identifier, price, i64};
use pyth::price_info::PriceInfoObject;
use deepbook::balance_manager::{TradeCap, DepositCap, WithdrawCap};

// === Errors ===
const EInvalidID: u64 = 0;
const EWithdrawAmountTooLarge: u64 = 1;
const EMintAmountTooLarge: u64 = 2;
const EUserNotRegistered: u64 = 3;

/// Event emitted when a deposit or withdrawal occurs
public struct BalanceEvent has copy, drop {
  vault: ID,
  user: address,
  base_asset_amount: u64,
  quote_asset_amount: u64,
  lp_amount: u64, 
  deposit: bool
}

/// Event emitted when a user registers their BalanceManager
public struct RegistrationEvent has copy, drop {
  vault: ID,
  user: address,
}

/// Wrapper for user's BalanceManager with capabilities
public struct UserBalanceManager has store {
  balance_manager: balance_manager::BalanceManager,
  trade_cap: TradeCap,
  deposit_cap: DepositCap,
  withdraw_cap: WithdrawCap
}

/// A shared object that holds funds used by the market maker
public struct Vault<phantom BaseAsset, phantom QuoteAsset, phantom T> has key, store {
  id: UID,
  lp_treasury_cap: TreasuryCap<T>,
  user_balance_managers: VecMap<address, UserBalanceManager>,
  base_price_id: vector<u8>,
  quote_price_id: vector<u8>
}

/// Initializes and shares vault object
public fun create_vault<BaseAsset, QuoteAsset, T>(
  lp_treasury_cap: TreasuryCap<T>, 
  base_price_id: vector<u8>,
  quote_price_id: vector<u8>,
  ctx: &mut TxContext
) {
  let vault = Vault<BaseAsset, QuoteAsset, T> {
    id: object::new(ctx),
    lp_treasury_cap: lp_treasury_cap,
    user_balance_managers: vec_map::empty(),
    base_price_id,
    quote_price_id
  };

  sui::transfer::share_object(vault);
}

/// Register user's BalanceManager with the vault
public fun take_bm<BaseAsset, QuoteAsset, T>(
  vault: &mut Vault<BaseAsset, QuoteAsset, T>,
  balance_manager: balance_manager::BalanceManager,
  trade_cap: TradeCap,
  deposit_cap: DepositCap,
  withdraw_cap: WithdrawCap,
  ctx: &mut TxContext,
) {
  let user = ctx.sender();
  
  let user_bm = UserBalanceManager {
    balance_manager,
    trade_cap,
    deposit_cap,
    withdraw_cap
  };
  
  vault.user_balance_managers.insert(user, user_bm);
  
  event::emit(RegistrationEvent {
    vault: object::id(vault),
    user: user,
  });
}

/// Deposit into vault
public fun deposit<BaseAsset, QuoteAsset, T>(
  vault: &mut Vault<BaseAsset, QuoteAsset, T>,
  base_coin: Coin<BaseAsset>,
  quote_coin: Coin<QuoteAsset>,
  base_asset_price_info_object: &PriceInfoObject, 
  quote_asset_price_info_object: &PriceInfoObject,
  clock: &Clock,
  ctx: &mut TxContext,
): Coin<T> {
  let user = ctx.sender();

  assert!(vault.user_balance_managers.contains(&user), EUserNotRegistered);

  let base_deposit_amount = base_coin.value();
  let quote_deposit_amount = quote_coin.value();
  
  let (base_price, base_expo) = get_price(vault.base_price_id, base_asset_price_info_object, clock);
  let (quote_price, quote_expo) = get_price(vault.quote_price_id, quote_asset_price_info_object, clock);
  let normalized_base_price = normalize_price(&base_price, &base_expo);
  let normalized_quote_price = normalize_price(&quote_price, &quote_expo);

  // divide the scaled values by 100_000_000 to get the true value
  // we don't do this because it would give us decimal, so we used a scaled version of the price in USD
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

  let user_bm = vault.user_balance_managers.get_mut(&user);
  user_bm.balance_manager.deposit_with_cap(&user_bm.deposit_cap, base_coin, ctx);
  user_bm.balance_manager.deposit_with_cap(&user_bm.deposit_cap, quote_coin, ctx);  

  let lp = vault.lp_treasury_cap.mint(lp_tokens_to_mint as u64, ctx);

  event::emit(BalanceEvent {
    vault: object::id(vault),
    user: user,
    base_asset_amount: base_deposit_amount,
    quote_asset_amount: quote_deposit_amount,
    lp_amount: lp_tokens_to_mint as u64,
    deposit: true
  });

  lp
}

/// Withdraw from vault
public fun withdraw<BaseAsset, QuoteAsset, T>(
  vault: &mut Vault<BaseAsset, QuoteAsset, T>,
  lp_coin: Coin<T>,
  ctx: &mut TxContext,
): (Coin<BaseAsset>, Coin<QuoteAsset>) {
  let user = ctx.sender();
  let lp_amount = lp_coin.value();

  assert!(vault.user_balance_managers.contains(&user), EUserNotRegistered);

  let total_lp_supply = vault.lp_treasury_cap.total_supply();
  let user_vault_share = (lp_amount as u256) / (total_lp_supply as u256);

  let (total_base_balance, total_quote_balance) = get_vault_balance(vault);

  let base_to_withdraw = (total_base_balance as u256) * user_vault_share;
  let quote_to_withdraw = (total_quote_balance as u256) * user_vault_share;

  assert!(base_to_withdraw <= (0xFFFFFFFFFFFFFFFF as u256), EWithdrawAmountTooLarge);
  assert!(quote_to_withdraw <= (0xFFFFFFFFFFFFFFFF as u256), EWithdrawAmountTooLarge);

  let user_bm = vault.user_balance_managers.get_mut(&user);
  let base_coin = user_bm.balance_manager.withdraw_with_cap<BaseAsset>(&user_bm.withdraw_cap, base_to_withdraw as u64, ctx);
  let quote_coin = user_bm.balance_manager.withdraw_with_cap<QuoteAsset>(&user_bm.withdraw_cap, quote_to_withdraw as u64, ctx);

  vault.lp_treasury_cap.burn(lp_coin);

  event::emit(BalanceEvent {
    vault: object::id(vault),
    user: user,
    base_asset_amount: base_coin.value(),
    quote_asset_amount: quote_coin.value(),
    lp_amount: lp_amount,
    deposit: false,
  });

  (base_coin, quote_coin)
}

/// Get the balance manager of the vault
public fun get_user_balance_manager<BaseAsset, QuoteAsset, T>(vault: &mut Vault<BaseAsset, QuoteAsset, T>, user: address): &mut balance_manager::BalanceManager {
  assert!(vault.user_balance_managers.contains(&user), EUserNotRegistered);
  let user_bm = vault.user_balance_managers.get_mut(&user);
  &mut user_bm.balance_manager
}

/// Get the trade cap of a specific user
public fun get_user_trade_cap<BaseAsset, QuoteAsset, T>(vault: &mut Vault<BaseAsset, QuoteAsset, T>, user: address): &mut TradeCap {
  assert!(vault.user_balance_managers.contains(&user), EUserNotRegistered);
  let user_bm = vault.user_balance_managers.get_mut(&user);
  &mut user_bm.trade_cap
}

/// Check if user is registered
public fun is_user_registered<BaseAsset, QuoteAsset, T>(vault: &Vault<BaseAsset, QuoteAsset, T>, user: address): bool {
  vault.user_balance_managers.contains(&user)
}

/// Get total balance of base and quote asset
public fun get_vault_balance<BaseAsset, QuoteAsset, T>(vault: &Vault<BaseAsset, QuoteAsset, T>): (u64, u64) {
  let mut total_base_asset_balance: u64 = 0;
  let mut total_quote_asset_balance: u64 = 0;
  
  let mut i = 0;
  let user_addresses = vault.user_balance_managers.keys();
  let length = user_addresses.length();
  
  while (i < length) {
    let user_addr = user_addresses[i];
    let user_bm = vault.user_balance_managers.get(&user_addr);
    
    total_base_asset_balance = total_base_asset_balance + user_bm.balance_manager.balance<BaseAsset>();
    total_quote_asset_balance = total_quote_asset_balance + user_bm.balance_manager.balance<QuoteAsset>();
    
    i = i + 1;
  };
  
  (total_base_asset_balance, total_quote_asset_balance)
}

/// Get total value of vault
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

  let mut i = 0;
  let user_addresses = vault.user_balance_managers.keys();
  let length = user_addresses.length();
  while (i < length) {
    let user_addr = user_addresses[i];
    let user_bm = vault.user_balance_managers.get(&user_addr);

    total_value = total_value + (user_bm.balance_manager.balance<BaseAsset>() as u256) * (normalized_base_price);
    total_value = total_value + (user_bm.balance_manager.balance<QuoteAsset>() as u256) * (normalized_quote_price);

    i = i + 1;
  };

  total_value
}

/// Get price of asset
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

/// Normalize the price
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
module deepbookamm::mm_vault;

use sui::clock::Clock;
use sui::coin::{Coin, TreasuryCap};
use sui::event;
use sui::math::pow;
use sui::vec_map::{VecMap, Self};
use sui::sui::SUI;
use usdc::usdc::USDC;
use token::deep::DEEP;
use deepbook::balance_manager;
use pyth::{pyth, price_info, price_identifier, price};
use pyth::price_info::PriceInfoObject;
use deepbook::balance_manager::{TradeCap, DepositCap, WithdrawCap};

// === Errors ===
const EInvalidID: u64 = 0;
const EWithdrawAmountTooLarge: u64 = 1;
const EMintAmountTooLarge: u64 = 2;
const EUserNotRegistered: u64 = 3;
const EInvalidExponent: u64 = 4;

/// Event emitted when a deposit or withdrawal occurs
public struct BalanceEvent has copy, drop {
  vault: ID,
  user: address,
  asset_amount: u64,
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
public struct Vault<phantom P> has key, store {
  id: UID,
  lp_treasury_cap: TreasuryCap<P>,
  user_balance_managers: VecMap<address, UserBalanceManager>,
}

/// Initializes and shares vault object
public fun create_vault<T>(lp_treasury_cap: TreasuryCap<T>, ctx: &mut TxContext) {
  let vault = Vault<T> {
    id: object::new(ctx),
    lp_treasury_cap: lp_treasury_cap,
    user_balance_managers: vec_map::empty()
  };

  sui::transfer::share_object(vault);
}

/// Register user's BalanceManager with the vault
public fun take_bm<T>(
  vault: &mut Vault<T>,
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
public fun deposit<T>(
  vault: &mut Vault<T>,
  coin: Coin<DEEP>,
  sui_price_info_object: &PriceInfoObject, 
  deep_price_info_object: &PriceInfoObject,
  usdc_price_info_object: &PriceInfoObject,
  clock: &Clock,
  ctx: &mut TxContext,
): Coin<T> {
  let user = ctx.sender();
  let deposit_amount = coin.value();

  assert!(vault.user_balance_managers.contains(&user), EUserNotRegistered);

  let user_bm = vault.user_balance_managers.get_mut(&user);
  user_bm.balance_manager.deposit_with_cap(&user_bm.deposit_cap, coin, ctx);  

  let total_vault_value = get_total_value(
    vault, 
    sui_price_info_object, 
    deep_price_info_object, 
    usdc_price_info_object, 
    clock
  );

  let total_lp_supply = vault.lp_treasury_cap.total_supply();
  let lp_tokens_to_mint = (deposit_amount * total_lp_supply as u256) / total_vault_value;

  assert!(lp_tokens_to_mint <= (0xFFFFFFFFFFFFFFFF as u256), EMintAmountTooLarge);

  let lp = vault.lp_treasury_cap.mint(lp_tokens_to_mint as u64, ctx);

  event::emit(BalanceEvent {
    vault: object::id(vault),
    user: user,
    asset_amount: deposit_amount,
    lp_amount: lp_tokens_to_mint as u64,
    deposit: true
  });

  lp
}

/// Withdraw from vault
public fun withdraw<T>(
  vault: &mut Vault<T>,
  lp_coin: Coin<T>,
  sui_price_info_object: &PriceInfoObject, 
  deep_price_info_object: &PriceInfoObject,
  usdc_price_info_object: &PriceInfoObject,
  clock: &Clock,
  ctx: &mut TxContext,
): Coin<DEEP> {
  let user = ctx.sender();
  let lp_amount = lp_coin.value();

  assert!(vault.user_balance_managers.contains(&user), EUserNotRegistered);

  let total_vault_value = get_total_value(
    vault, 
    sui_price_info_object, 
    deep_price_info_object, 
    usdc_price_info_object, 
    clock
  );
  let total_lp_supply = vault.lp_treasury_cap.total_supply();
  let user_vault_share = (lp_amount as u256 * total_vault_value) / (total_lp_supply as u256);

  let deep_price = get_deep_price(deep_price_info_object, clock);
  let deep_to_withdraw = user_vault_share / deep_price;

  assert!(deep_to_withdraw <= (0xFFFFFFFFFFFFFFFF as u256), EWithdrawAmountTooLarge);

  let user_bm = vault.user_balance_managers.get_mut(&user);
  let deep_coin = user_bm.balance_manager.withdraw_with_cap<DEEP>(&user_bm.withdraw_cap, deep_to_withdraw as u64, ctx);
  vault.lp_treasury_cap.burn(lp_coin);

  event::emit(BalanceEvent {
    vault: object::id(vault),
    user: user,
    asset_amount: deep_coin.value(),
    lp_amount: lp_amount,
    deposit: false,
  });

  deep_coin
}

/// Get the balance manager of the vault
public fun get_user_balance_manager<T>(vault: &mut Vault<T>, user: address): &mut balance_manager::BalanceManager {
  assert!(vault.user_balance_managers.contains(&user), EUserNotRegistered);
  let user_bm = vault.user_balance_managers.get_mut(&user);
  &mut user_bm.balance_manager
}

/// Get the trade cap of a specific user
public fun get_user_trade_cap<T>(vault: &mut Vault<T>, user: address): &mut TradeCap {
  assert!(vault.user_balance_managers.contains(&user), EUserNotRegistered);
  let user_bm = vault.user_balance_managers.get_mut(&user);
  &mut user_bm.trade_cap
}

/// Check if user is registered
public fun is_user_registered<T>(vault: &Vault<T>, user: address): bool {
  vault.user_balance_managers.contains(&user)
}

/// Get total value of vault
fun get_total_value<T>(
  vault: &Vault<T>, 
  sui_price_info_object: &PriceInfoObject, 
  deep_price_info_object: &PriceInfoObject,
  usdc_price_info_object: &PriceInfoObject,
  clock: &Clock,
): u256 {
  let usdc_price = get_usdc_price(usdc_price_info_object, clock);
  let sui_price = get_sui_price(sui_price_info_object, clock);
  let deep_price = get_deep_price(deep_price_info_object, clock);

  let mut total_value: u256 = 0;

  let mut i = 0;
  let user_addresses = vault.user_balance_managers.keys();
  let length = user_addresses.length();
  while (i < length) {
    let user_addr = user_addresses[i];
    let user_bm = vault.user_balance_managers.get(&user_addr);

    total_value = total_value + (user_bm.balance_manager.balance<USDC>() as u256) * usdc_price;
    total_value = total_value + (user_bm.balance_manager.balance<SUI>() as u256) * sui_price;
    total_value = total_value + (user_bm.balance_manager.balance<DEEP>() as u256) * deep_price;

    i = i + 1;
  };

  total_value
}

/// Get price of USDC
fun get_usdc_price(price_info_object: &PriceInfoObject, clock: &Clock): u256 {
  let max_age = 60;
  let price_struct = pyth::get_price_no_older_than(price_info_object, clock, max_age);
  let price_info = price_info::get_price_info_from_price_info_object(price_info_object);
  let price_id = price_identifier::get_bytes(&price_info::get_price_identifier(&price_info));

  assert!(price_id == x"eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a", EInvalidID);

  let price = price::get_price(&price_struct);
  let expo = price::get_expo(&price_struct);

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

  calculate_price_with_expo(price_magnitude, expo_magnitude, expo.get_is_negative())
}

/// Get price of SUI
fun get_sui_price(price_info_object: &PriceInfoObject, clock: &Clock): u256 {
  let max_age = 60;
  let price_struct = pyth::get_price_no_older_than(price_info_object, clock, max_age);
  let price_info = price_info::get_price_info_from_price_info_object(price_info_object);
  let price_id = price_identifier::get_bytes(&price_info::get_price_identifier(&price_info));

  assert!(price_id == x"23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744", EInvalidID);

  let price = price::get_price(&price_struct);
  let expo = price::get_expo(&price_struct);

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

  calculate_price_with_expo(price_magnitude, expo_magnitude, expo.get_is_negative())
}

/// Get price of DEEP
fun get_deep_price(price_info_object: &PriceInfoObject, clock: &Clock): u256 {
  let max_age = 60;
  let price_struct = pyth::get_price_no_older_than(price_info_object, clock, max_age);
  let price_info = price_info::get_price_info_from_price_info_object(price_info_object);
  let price_id = price_identifier::get_bytes(&price_info::get_price_identifier(&price_info));

  assert!(price_id == x"29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff", EInvalidID);

  let price = price::get_price(&price_struct);
  let expo = price::get_expo(&price_struct);

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

  calculate_price_with_expo(price_magnitude, expo_magnitude, expo.get_is_negative())
}

fun calculate_price_with_expo(price_magnitude: u64, expo_magnitude: u64, expo_is_negative: bool): u256 {
  let price_u256 = price_magnitude as u256;
  
  if (expo_is_negative) {
    if (expo_magnitude > 18) {
      let divisor_exponent = (expo_magnitude as u64) - 18;
      assert!(divisor_exponent <= 77, EInvalidExponent);
      price_u256 / (pow(10, (divisor_exponent as u8)) as u256)
    } else {
      let multiplier_exponent = 18 - (expo_magnitude as u64);
      price_u256 * (pow(10, (multiplier_exponent as u8)) as u256)
    }
  } else {
    let total_exponent = 18 + (expo_magnitude as u64);
    assert!(total_exponent <= 77, EInvalidExponent);
    
    price_u256 * (pow(10, (total_exponent as u8)) as u256)
  }
}

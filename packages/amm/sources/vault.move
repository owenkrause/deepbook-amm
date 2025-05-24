module deepbookamm::mm_vault;

use sui::clock::Clock;
use sui::coin::{Coin, TreasuryCap};
use sui::event;
use sui::math::pow;
use sui::sui::SUI;
use usdc::usdc::USDC;
use token::deep::DEEP;
use deepbook::balance_manager;
use pyth::{pyth, price_info, price_identifier, price};
use pyth::price_info::PriceInfoObject;
use deepbook::balance_manager::TradeCap;

// === Errors ===
const EInvalidID: u64 = 0;
const EWithdrawAmountTooLarge: u64 = 1;
const EMintAmountTooLarge: u64 = 2;

/// A shared object that holds funds used by the market maker
public struct Vault<phantom P> has key, store {
  id: UID,
  lp_treasury_cap: TreasuryCap<P>,
  balance_manager: balance_manager::BalanceManager,
}

/// Event emitted when a deposit or withdrawal occurs
public struct BalanceEvent has copy, drop {
  vault: ID,
  user: address,
  asset_amount: u64,
  lp_amount: u64, 
  deposit: bool
}

/// Initializes and shares vault object
public fun create_vault<T>(lp_treasury_cap: TreasuryCap<T>, ctx: &mut TxContext) {
  let vault = Vault<T> {
    id: object::new(ctx),
    lp_treasury_cap: lp_treasury_cap,
    balance_manager: balance_manager::new(ctx),
  };

  sui::transfer::share_object(vault);
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

  vault.balance_manager.deposit(coin, ctx);  

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

  let deep_coin = vault.balance_manager.withdraw<DEEP>(deep_to_withdraw as u64, ctx);

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
public fun get_balance_manager<T>(vault: &mut Vault<T>): &mut balance_manager::BalanceManager {
  &mut vault.balance_manager
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
  total_value = total_value + (vault.balance_manager.balance<USDC>() as u256) * usdc_price;
  total_value = total_value + (vault.balance_manager.balance<SUI>() as u256) * sui_price;
  total_value = total_value + (vault.balance_manager.balance<DEEP>() as u256) * deep_price;

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

  (price.get_magnitude_if_positive() as u256) * (pow(10, 18 - (expo.get_magnitude_if_positive() as u8)) as u256)
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

  (price.get_magnitude_if_positive() as u256) * (pow(10, 18 - (expo.get_magnitude_if_positive() as u8)) as u256)
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

  (price.get_magnitude_if_positive() as u256) * (pow(10, 18 - (expo.get_magnitude_if_positive() as u8)) as u256)
}

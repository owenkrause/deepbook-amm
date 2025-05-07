module deepbookamm::vault;

use std::type_name::{Self, TypeName};
use sui::table::{Self, Table};
use sui::bag::{Self, Bag};
use sui::coin::Coin;
use sui::event;
use deepbook::balance_manager;

// === Errors ===
const EInsufficientBalanceToWithdraw: u64 = 0;

/// A shared object that holds funds used by the market maker
public struct Vault has key, store {
  id: UID,
  balances: Table<address, Bag>,
  balance_manager: balance_manager::BalanceManager,
}

/// An object that stores a user's balance
public struct UserBalance has store, drop {
  amount: u64
}

/// Event emitted when a deposit or withdrawal occurs
public struct BalanceEvent has copy, drop {
  vault: ID,
  user: address,
  asset: TypeName,
  amount: u64,
  deposit: bool
}

/// Initializes and shares vault object
fun init(ctx: &mut TxContext) {
  let vault = Vault {
    id: object::new(ctx),
    balances: table::new(ctx),
    balance_manager: balance_manager::new(ctx),
  };

  sui::transfer::share_object(vault);
}

/// Deposit into vault
public fun deposit<T>(
  vault: &mut Vault,
  coin: Coin<T>,
  ctx: &mut TxContext,
) {
  let user = ctx.sender();
  let coin_value = coin.value();
  let coin_type = type_name::get<T>();

  event::emit(BalanceEvent {
    vault: object::id(vault),
    user: user,
    asset: coin_type,
    amount: coin_value,
    deposit: true,
  });

  if (!vault.balances.contains(user)) {
    vault.balances.add(user, bag::new(ctx));
  };

  let user_balances = vault.balances.borrow_mut(user);
  if (user_balances.contains(coin_type)) {
    user_balances.add(coin_type, UserBalance { amount: 0 });
  };

  let user_balance = user_balances.borrow_mut<TypeName, UserBalance>(coin_type);
  user_balance.amount = user_balance.amount + coin_value;

  balance_manager::deposit(&mut vault.balance_manager, coin, ctx);
}

/// Withdraw from vault
public fun withdraw<T>(
  vault: &mut Vault,
  amount: u64,
  ctx: &mut TxContext,
): Coin<T> {
  let user = ctx.sender();
  let coin_type = type_name::get<T>();

  assert!(vault.balances.contains(user), EInsufficientBalanceToWithdraw);

  let user_balances = vault.balances.borrow_mut(user);
  assert!(user_balances.contains(coin_type), EInsufficientBalanceToWithdraw);

  let user_balance = user_balances.borrow_mut<TypeName, UserBalance>(coin_type);
  assert!(amount <= user_balance.amount, EInsufficientBalanceToWithdraw);

  user_balance.amount = user_balance.amount - amount;

  let coin = balance_manager::withdraw<T>(&mut vault.balance_manager, amount, ctx);

  event::emit(BalanceEvent {
    vault: object::id(vault),
    user: user,
    asset: coin_type,
    amount: amount,
    deposit: false,
  });

  coin
}
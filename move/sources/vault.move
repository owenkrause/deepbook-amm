module deepbookamm::vault;

use sui::table::{Self, Table};
use sui::bag::{Self, Bag};
use deepbook::balance_manager::{BalanceManager};

public struct Vault has store {
  balances: Table<address, Bag>,
  balance_manager: BalanceManager,
}

public fun init() {

}
use sui::balance;
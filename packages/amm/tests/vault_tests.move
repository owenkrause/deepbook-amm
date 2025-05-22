#[test_only]

module deepbookamm::mm_vault_tests;

use sui::sui::SUI;
use sui::coin::mint_for_testing;
use sui::test_scenario::{begin, end, has_most_recent_shared, take_shared, return_shared};
use deepbookamm::mm_vault::{Vault, create_vault, deposit, withdraw, get_balance, get_balance_manager};

#[test]
fun test_create_vault() {
  let mut test = begin(@0xF);
  let alice = @0xA;

  test.next_tx(alice);
  {
    create_vault(test.ctx());
  };

  test.next_tx(alice);
  {
    assert!(has_most_recent_shared<Vault>(), 0);
  };

  end(test);
}

#[test]
fun test_deposit() {
  let mut test = begin(@0xF);
  let alice = @0xA;

  test.next_tx(alice);
  {
    create_vault(test.ctx());
  };

  test.next_tx(alice);
  {
    let mut vault = take_shared<Vault>(&test);

    deposit(
      &mut vault, 
      mint_for_testing<SUI>(100, test.ctx()),
      test.ctx()
    );

    let balance_manager = get_balance_manager(&mut vault);
    let bm_balance = balance_manager.balance<SUI>();
    let vault_balance = get_balance<SUI>(&vault, test.ctx());

    assert!(vault_balance == bm_balance, 0);
    assert!(vault_balance == 100, 0);

    return_shared(vault);
  };

  end(test);
}

#[test]
fun test_withdraw() {
  let mut test = begin(@0xF);
  let alice = @0xA;

  test.next_tx(alice);
  {
    create_vault(test.ctx());
  };

  test.next_tx(alice); 
  {
    let mut vault = take_shared<Vault>(&test);

    deposit(
      &mut vault, 
      mint_for_testing<SUI>(100, test.ctx()),
      test.ctx()
    );

    return_shared(vault);
  };

  test.next_tx(alice);
  {
    let mut vault = take_shared<Vault>(&test);

    let coin = withdraw<SUI>(
      &mut vault, 
      50,
      test.ctx()
    );

    assert!(coin.value() == 50, 0);
    coin.burn_for_testing();

    assert!(get_balance<SUI>(&vault, test.ctx()) == 50, 0);

    return_shared(vault);
  };

  end(test);
}
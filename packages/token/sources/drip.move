module token::drip;

use std::option::none;
use sui::coin;

public struct DRIP has drop {}

fun init(otw: DRIP, ctx: &mut TxContext) {
  let (treasury_cap, coin_metadata) = coin::create_currency(
    otw,
    9,
    b"DRIP",
    b"Drip",
    b"The liquid staking token for Deepbook AMM",
    none(), 
    ctx
  );

  transfer::public_freeze_object(coin_metadata);
  transfer::public_transfer(treasury_cap, ctx.sender())
}

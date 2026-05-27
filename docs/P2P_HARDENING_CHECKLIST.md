# P2P hardening — manual test checklist

Run after deploying backend + app builds.

## Unified balance (USDT/USDC)

1. User with USDT on TRON + Ethereum → wallet shows single **USDT** total.
2. P2P market filter **USDT** lists ads for `USDT`, `USDT_TRON`, etc.
3. Sell 150 USDT on generic `USDT` ad → create order → vendor **accept** → pay → release → **completed**.

## Auto-accept

4. Create SELL ad with `autoAccept: true` → place order → status `awaiting_payment` and seller crypto **frozen** (available balance reduced).

## Cancel / expiry

5. Accept order → **cancel** before payment → seller unified balance restored.
6. Accept order → wait past `expiresAt` → open order details → status **cancelled**, crypto unfrozen.

## Chat

7. Buyer and seller open chat from order → send messages both ways → mark read.

## History

8. **P2P Transactions** screen: status filter **Completed** returns rows; summary incoming/outgoing non-zero.
9. After RhinoxPay fiat payment, direction shows correctly (not `unknown`).
10. On-chain deposit → appears under crypto deposit history (Transaction row from webhook).

## App UI

11. **BuyOrder** step 0: shows real **NGN** (or ad fiat) balance and ad crypto symbol (not hardcoded USDT 0.00).
12. **OrderDetails** header uses ad `cryptoCurrency` base symbol.

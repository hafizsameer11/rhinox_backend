# P2P Flow Verification - BUY and SELL Ads

## ✅ Implementation Status: COMPLETE FOR BOTH BUY AND SELL

### Core Invariant
**Crypto ALWAYS moves from SELLER → BUYER**

---

## Scenario 1: Vendor SELL Ad (User sees as BUY)

### Role Resolution
- `ad.type = 'sell'`
- **Vendor = SELLER** (has crypto to sell)
- **User = BUYER** (wants to buy crypto)

### Flow Steps

1. **Order Creation** (`POST /api/p2p/orders`)
   - ✅ User enters `cryptoAmount` (quantity they want to buy)
   - ✅ Validates: Vendor (seller) has sufficient crypto balance
   - ✅ Validates: `maxOrder` doesn't exceed vendor's crypto balance
   - ✅ Validates: Order amount within min/max limits
   - ✅ Status: `pending` (or `awaiting_payment` if auto-accept)

2. **Vendor Accepts** (`POST /api/p2p/orders/:id/accept`)
   - ✅ Vendor accepts order
   - ✅ Crypto frozen from vendor's VirtualAccount (seller)
   - ✅ Processing time countdown starts
   - ✅ Status: `pending` → `awaiting_payment`

3. **Buyer Confirms Payment** (`POST /api/p2p/orders/:id/confirm-payment`)
   - ✅ User (buyer) confirms payment made
   - ✅ For RhinoxPay ID: Automatic fiat transfer (buyer → seller)
   - ✅ For offline: Status → `payment_made`

4. **Seller Marks Payment Received** (`POST /api/p2p/orders/:id/mark-paid`)
   - ✅ Vendor (seller) marks payment received
   - ✅ Status: `payment_made` → `awaiting_coin_release`
   - ✅ Auto-releases crypto

5. **Crypto Release** (automatic)
   - ✅ Crypto moves: Vendor (seller) → User (buyer)
   - ✅ Status: `awaiting_coin_release` → `completed`

---

## Scenario 2: Vendor BUY Ad (User sees as SELL)

### Role Resolution
- `ad.type = 'buy'`
- **Vendor = BUYER** (wants to buy crypto)
- **User = SELLER** (has crypto to sell)

### Flow Steps

1. **Order Creation** (`POST /api/p2p/orders`)
   - ✅ User enters `cryptoAmount` (quantity they want to sell)
   - ✅ Validates: User (seller) has sufficient crypto balance
   - ✅ Validates: Vendor (buyer) has sufficient fiat balance
   - ✅ Validates: `maxOrder` doesn't exceed vendor's fiat balance
   - ✅ Validates: Order amount within min/max limits
   - ✅ Status: `pending` (or `awaiting_payment` if auto-accept)

2. **Vendor Accepts** (`POST /api/p2p/orders/:id/accept`)
   - ✅ Vendor accepts order
   - ✅ Crypto frozen from user's VirtualAccount (seller)
   - ✅ Processing time countdown starts
   - ✅ Status: `pending` → `awaiting_payment`

3. **Buyer Confirms Payment** (`POST /api/p2p/orders/:id/confirm-payment`)
   - ✅ Vendor (buyer) confirms payment made
   - ✅ For RhinoxPay ID: Automatic fiat transfer (buyer → seller)
   - ✅ For offline: Status → `payment_made`

4. **Seller Marks Payment Received** (`POST /api/p2p/orders/:id/mark-paid`)
   - ✅ User (seller) marks payment received
   - ✅ Status: `payment_made` → `awaiting_coin_release`
   - ✅ Auto-releases crypto

5. **Crypto Release** (automatic)
   - ✅ Crypto moves: User (seller) → Vendor (buyer)
   - ✅ Status: `awaiting_coin_release` → `completed`

---

## Key Validations

### For SELL Ads (Vendor sells)
- ✅ Vendor must have crypto balance ≥ order amount
- ✅ Vendor's `maxOrder` cannot exceed their crypto balance
- ✅ Buyer pays fiat to seller
- ✅ Crypto moves: Vendor → User

### For BUY Ads (Vendor buys)
- ✅ User (seller) must have crypto balance ≥ order amount
- ✅ Vendor (buyer) must have fiat balance ≥ order amount
- ✅ Vendor's `maxOrder` cannot exceed their fiat balance
- ✅ Buyer (vendor) pays fiat to seller (user)
- ✅ Crypto moves: User → Vendor

---

## Payment Methods

### RhinoxPay ID
- ✅ Automatic payment confirmation
- ✅ Fiat transfer: Buyer → Seller (automatic)
- ✅ Crypto release: Automatic after payment

### Offline Payment
- ✅ Buyer confirms payment made
- ✅ Seller marks payment received
- ✅ Crypto release: Automatic after seller confirms

---

## Transaction Recording

All steps are recorded in `Transaction` table:
- ✅ Order created
- ✅ Order accepted (crypto frozen)
- ✅ Payment confirmed
- ✅ Payment received
- ✅ Crypto debited (seller)
- ✅ Crypto credited (buyer)
- ✅ Order completed

---

## API Endpoints

### Public
- `GET /api/p2p/ads/browse` - Browse ads (with user perspective transformation)
- `GET /api/p2p/ads/:id` - Get ad details

### Protected
- `POST /api/p2p/orders` - Create order
- `POST /api/p2p/orders/:id/accept` - Vendor accepts order
- `POST /api/p2p/orders/:id/decline` - Vendor declines order
- `POST /api/p2p/orders/:id/confirm-payment` - Buyer confirms payment
- `POST /api/p2p/orders/:id/mark-paid` - Seller marks payment received
- `POST /api/p2p/orders/:id/cancel` - Cancel order
- `GET /api/p2p/orders` - Get user's orders
- `GET /api/p2p/orders/:id` - Get order details

---

## ✅ Verification Complete

Both BUY and SELL ad flows are fully implemented and tested:
- ✅ Role resolution works correctly
- ✅ Balance validations for both scenarios
- ✅ Payment flows handle both ad types
- ✅ Crypto release always from SELLER → BUYER
- ✅ Transaction recording for all steps
- ✅ API visibility transformation (user perspective)

**Status: READY FOR PRODUCTION** 🚀


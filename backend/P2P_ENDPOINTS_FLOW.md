# P2P Order Endpoints - UI Flow Mapping

## Complete Order Flow with Endpoints

### 1. Browse & Select Ad (Public)
- **GET** `/api/p2p/ads/browse` - Browse all available ads
- **GET** `/api/p2p/ads/:id` - Get ad details with payment methods

### 2. Create Order (User)
- **POST** `/api/p2p/orders` - User creates order from ad
  - Status: `pending` (if vendor must accept) or `awaiting_payment` (if auto-accept)
  - Returns: Order details with status

### 3. Vendor Actions (Order Received State)
- **POST** `/api/p2p/orders/:id/vendor/accept` - Vendor accepts order
  - Status: `pending` → `awaiting_payment`
  - Crypto frozen from seller
  - Processing time countdown starts
  
- **POST** `/api/p2p/orders/:id/vendor/decline` - Vendor declines order
  - Status: `pending` → `cancelled`

### 4. Buyer Actions (Awaiting Payment State)
- **POST** `/api/p2p/orders/:id/buyer/payment-made` - Buyer confirms payment made
  - Status: `awaiting_payment` → `payment_made`
  - For RhinoxPay ID: Automatic payment + auto-release crypto
  - For offline: Manual confirmation required

### 5. Vendor Actions (Payment Made State)
- **POST** `/api/p2p/orders/:id/vendor/payment-received` - Vendor marks payment received
  - Status: `payment_made` → `awaiting_coin_release` → `completed`
  - Crypto automatically released to buyer

### 6. Order Management
- **GET** `/api/p2p/orders` - Get user's orders (as buyer or vendor)
- **GET** `/api/p2p/orders/:id` - Get order details with chat
- **POST** `/api/p2p/orders/:id/cancel` - Cancel order (buyer or vendor)

## Status Flow

```
pending → awaiting_payment → payment_made → awaiting_coin_release → completed
   ↓              ↓                ↓
cancelled    cancelled      cancelled
```

## Role-Based Endpoints

All endpoints clearly indicate WHO can perform the action:
- `/vendor/*` - Only vendor (ad owner) can call
- `/buyer/*` - Only buyer (order creator) can call
- No prefix - Either party can call


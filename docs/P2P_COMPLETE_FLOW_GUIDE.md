# P2P Complete Flow Guide - Frontend Integration

## 🎯 Complete Order Flow with Endpoints

This guide maps the UI flow to backend endpoints, making it clear for frontend developers.

---

## 📱 UI Flow → Backend Endpoints

### **Step 1: Browse Market (Public)**
**UI:** P2P Market screen → User sees list of ads

**Endpoint:** `GET /api/p2p/ads/browse?type=buy` or `?type=sell`

**What to show:**
- Use `userAction` field for UI labels (not `type`)
- If `userAction = "buy"` → Show "Buy" button
- If `userAction = "sell"` → Show "Sell" button
- Display vendor info, price, limits, payment methods

---

### **Step 2: View Ad Details (Public)**
**UI:** User taps on ad → Ad details screen

**Endpoint:** `GET /api/p2p/ads/:id`

**What to show:**
- Ad details with payment methods
- Use `userAction` to show correct button ("Buy" or "Sell")
- Display vendor payment account details (masked)

---

### **Step 3: Create Order (User)**
**UI:** User enters crypto amount → Clicks "Apply" → Order created

**Endpoint:** `POST /api/p2p/orders`
```json
{
  "adId": "uuid",
  "cryptoAmount": "5.00",
  "paymentMethodId": "uuid"
}
```

**Response:**
- `status`: `"pending"` or `"awaiting_payment"`
- `userAction`: `"buy"` or `"sell"` (for UI)

**Next UI State:**
- If `status = "pending"`: Show "Order Received" to vendor, "Waiting for vendor acceptance" to buyer
- If `status = "awaiting_payment"`: Show "Awaiting Payment" to buyer immediately

---

### **Step 4: Vendor Accepts Order**
**UI:** Vendor sees "Order Received" → Clicks "Accept Order"

**Endpoint:** `POST /api/p2p/orders/:id/vendor/accept`

**What happens:**
- Status: `pending` → `awaiting_payment`
- Crypto frozen from seller
- Processing time countdown starts

**UI Updates:**
- Buyer: Show "Awaiting Payment" screen
- Vendor: Show "Awaiting Payment" screen (waiting for buyer)

---

### **Step 5: Buyer Makes Payment**
**UI:** Buyer sees "Awaiting Payment" → Makes payment → Clicks "Payment Made"

**Endpoint:** `POST /api/p2p/orders/:id/buyer/payment-made`

**Payment Methods:**

#### **A. RhinoxPay ID (Automatic)**
- Buyer clicks "Payment Made"
- System automatically:
  1. Transfers fiat: Buyer → Seller
  2. Releases crypto: Seller → Buyer
  3. Status: `awaiting_payment` → `payment_made` → `awaiting_coin_release` → `completed`
- **Result:** Order completed immediately

#### **B. Offline Payment (Bank/Mobile Money)**
- Buyer clicks "Payment Made"
- Status: `awaiting_payment` → `payment_made`
- **Next:** Vendor must confirm payment received

**UI Updates:**
- Buyer: Show "Payment Made" screen
- Vendor: Show "Payment Made" screen (vendor needs to confirm)

---

### **Step 6: Vendor Confirms Payment Received (Offline Only)**
**UI:** Vendor sees "Payment Made" → Clicks "I have received Payment"

**Endpoint:** `POST /api/p2p/orders/:id/vendor/payment-received`

**What happens:**
- Status: `payment_made` → `awaiting_coin_release` → `completed`
- Crypto automatically released: Seller → Buyer

**UI Updates:**
- Both parties: Show "Completed" screen
- Enable review functionality

---

### **Step 7: Order Completed**
**UI:** Both parties see "Order Completed" → Can leave review

**Status:** `completed`

**Next actions:**
- Leave review: `POST /api/p2p/orders/:orderId/review`
- View order details: `GET /api/p2p/orders/:id`

---

## 🔄 Status Flow Diagram

```
┌─────────┐
│ pending │ ← Order created (vendor must accept)
└────┬────┘
     │
     │ Vendor accepts
     ▼
┌──────────────────┐
│ awaiting_payment │ ← Processing time countdown
└────┬─────────────┘
     │
     │ Buyer confirms payment
     ▼
┌──────────────┐
│ payment_made │ ← Vendor must confirm (offline) OR auto-complete (RhinoxPay ID)
└────┬─────────┘
     │
     │ Vendor confirms (offline) OR auto (RhinoxPay ID)
     ▼
┌──────────────────────┐
│ awaiting_coin_release │ ← Crypto release in progress
└────┬─────────────────┘
     │
     │ Crypto released
     ▼
┌───────────┐
│ completed │ ← Order finished, can leave review
└───────────┘
```

---

## 🎭 Role-Based Endpoints Summary

### **Vendor Endpoints** (Ad Owner)
- `POST /api/p2p/orders/:id/vendor/accept` - Accept order
- `POST /api/p2p/orders/:id/vendor/decline` - Decline order
- `POST /api/p2p/orders/:id/vendor/payment-received` - Confirm payment received (offline)

### **Buyer Endpoints** (Order Creator)
- `POST /api/p2p/orders/:id/buyer/payment-made` - Confirm payment made

### **Either Party**
- `GET /api/p2p/orders/:id` - View order details
- `POST /api/p2p/orders/:id/cancel` - Cancel order

---

## 📊 Response Fields for UI

### **Order Response Includes:**
```json
{
  "id": "order-id",
  "status": "pending|awaiting_payment|payment_made|awaiting_coin_release|completed",
  "userAction": "buy|sell",  // ← USE THIS for UI labels
  "isUserBuyer": true|false,  // ← USE THIS to show buyer actions
  "isUserSeller": true|false, // ← USE THIS to show seller actions
  "cryptoAmount": "5.00",
  "fiatAmount": "7750.00",
  "price": "1550.00",
  "paymentChannel": "rhinoxpay_id|offline",
  "acceptedAt": "2025-01-03T...",
  "expiresAt": "2025-01-03T...",  // Processing time expiration
  "paymentConfirmedAt": "2025-01-03T...",
  "paymentReceivedAt": "2025-01-03T...",
  "coinReleasedAt": "2025-01-03T...",
  "completedAt": "2025-01-03T...",
  "buyer": { "id", "name", "email" },
  "vendor": { "id", "name", "email" },
  "paymentMethod": { /* masked account details */ }
}
```

---

## 🎨 UI State Mapping

### **For Buyer:**
| Order Status | UI Screen | Available Actions |
|-------------|-----------|-------------------|
| `pending` | "Waiting for vendor acceptance" | Cancel order |
| `awaiting_payment` | "Awaiting Payment" | Make payment → "Payment Made" |
| `payment_made` | "Payment Made" | Wait for vendor (offline) OR Completed (RhinoxPay ID) |
| `awaiting_coin_release` | "Awaiting Coin Release" | Wait (automatic) |
| `completed` | "Order Completed" | Leave review, Close |

### **For Vendor:**
| Order Status | UI Screen | Available Actions |
|-------------|-----------|-------------------|
| `pending` | "Order Received" | Accept / Decline |
| `awaiting_payment` | "Awaiting Payment" | Wait for buyer |
| `payment_made` | "Payment Made" | "I have received Payment" (offline) |
| `awaiting_coin_release` | "Awaiting Coin Release" | Wait (automatic) |
| `completed` | "Order Completed" | Leave review, Close |

---

## 🔑 Key Points for Frontend

1. **Always use `userAction` for UI labels**, not `type`
2. **Check `isUserBuyer` and `isUserSeller`** to show correct actions
3. **Check `paymentChannel`** to determine if payment is automatic (RhinoxPay ID) or manual (offline)
4. **Use `status` to determine which screen to show**
5. **Check `expiresAt`** to show countdown timer (for `awaiting_payment` status)
6. **For offline payments:** Buyer confirms → Vendor confirms → Crypto released
7. **For RhinoxPay ID:** Buyer confirms → Automatic completion

---

## 📝 Example Frontend Logic

```typescript
// Determine which screen to show
function getOrderScreen(order, userId) {
  const isBuyer = order.isUserBuyer;
  const isSeller = order.isUserSeller;
  
  switch(order.status) {
    case 'pending':
      if (isSeller) return 'ORDER_RECEIVED'; // Vendor sees "Order Received"
      else return 'WAITING_ACCEPTANCE'; // Buyer sees "Waiting..."
      
    case 'awaiting_payment':
      if (isBuyer) return 'AWAITING_PAYMENT'; // Buyer makes payment
      else return 'AWAITING_BUYER_PAYMENT'; // Vendor waits
      
    case 'payment_made':
      if (order.paymentChannel === 'rhinoxpay_id') {
        return 'COMPLETED'; // Automatic
      } else {
        if (isSeller) return 'PAYMENT_MADE_VENDOR'; // Vendor confirms
        else return 'PAYMENT_MADE_BUYER'; // Buyer waits
      }
      
    case 'awaiting_coin_release':
      return 'AWAITING_COIN_RELEASE'; // Both see this
      
    case 'completed':
      return 'COMPLETED'; // Both see this
      
    default:
      return 'UNKNOWN';
  }
}

// Determine available actions
function getAvailableActions(order, userId) {
  const isBuyer = order.isUserBuyer;
  const isSeller = order.isUserSeller;
  const actions = [];
  
  if (order.status === 'pending' && isSeller) {
    actions.push({ type: 'accept', endpoint: `/orders/${order.id}/vendor/accept` });
    actions.push({ type: 'decline', endpoint: `/orders/${order.id}/vendor/decline` });
  }
  
  if (order.status === 'awaiting_payment' && isBuyer) {
    actions.push({ type: 'payment_made', endpoint: `/orders/${order.id}/buyer/payment-made` });
  }
  
  if (order.status === 'payment_made' && isSeller && order.paymentChannel === 'offline') {
    actions.push({ type: 'payment_received', endpoint: `/orders/${order.id}/vendor/payment-received` });
  }
  
  if (['pending', 'awaiting_payment'].includes(order.status)) {
    actions.push({ type: 'cancel', endpoint: `/orders/${order.id}/cancel` });
  }
  
  return actions;
}
```

---

## ✅ All Endpoints Summary

| Method | Endpoint | Who | Purpose |
|--------|----------|-----|---------|
| GET | `/api/p2p/ads/browse` | Public | Browse ads |
| GET | `/api/p2p/ads/:id` | Public | View ad details |
| POST | `/api/p2p/orders` | User | Create order |
| GET | `/api/p2p/orders` | User | Get my orders |
| GET | `/api/p2p/orders/:id` | Buyer/Vendor | Get order details |
| POST | `/api/p2p/orders/:id/vendor/accept` | Vendor | Accept order |
| POST | `/api/p2p/orders/:id/vendor/decline` | Vendor | Decline order |
| POST | `/api/p2p/orders/:id/buyer/payment-made` | Buyer | Confirm payment |
| POST | `/api/p2p/orders/:id/vendor/payment-received` | Seller | Confirm payment received |
| POST | `/api/p2p/orders/:id/cancel` | Buyer/Vendor | Cancel order |

---

**This flow matches Binance/Bybit P2P exactly!** 🚀


# P2P Routes Summary - Vendor vs User Separation

## 🎯 Route Structure

Routes are now clearly separated by **role** (Vendor vs User) and **action** (Buy vs Sell).

---

## 📱 USER ROUTES (Order Creators)

### **Browse Ads**
- **GET** `/api/p2p/user/ads/buy` - Browse ads to **BUY** crypto
  - Shows vendor **SELL** ads
  - User action: `buy`
  - Use for: "Buy" tab in P2P market

- **GET** `/api/p2p/user/ads/sell` - Browse ads to **SELL** crypto
  - Shows vendor **BUY** ads
  - User action: `sell`
  - Use for: "Sell" tab in P2P market

### **Order Management**
- **POST** `/api/p2p/user/orders` - Create order from ad
- **GET** `/api/p2p/user/orders` - Get my orders (where I am buyer)
- **GET** `/api/p2p/user/orders/:id` - Get order details
- **POST** `/api/p2p/user/orders/:id/payment-made` - Confirm payment made
- **POST** `/api/p2p/user/orders/:id/cancel` - Cancel my order

---

## 🏪 VENDOR ROUTES (Ad Owners)

### **Order Management**
- **GET** `/api/p2p/vendor/orders` - Get my vendor orders (orders for my ads)
- **GET** `/api/p2p/vendor/orders/:id` - Get order details
- **POST** `/api/p2p/vendor/orders/:id/accept` - Accept order
- **POST** `/api/p2p/vendor/orders/:id/decline` - Decline order
- **POST** `/api/p2p/vendor/orders/:id/payment-received` - Mark payment received
- **POST** `/api/p2p/vendor/orders/:id/cancel` - Cancel order (as vendor)

---

## 🌐 PUBLIC ROUTES

- **GET** `/api/p2p/ads/browse` - Browse all ads (public, no auth)
- **GET** `/api/p2p/ads/:id` - Get ad details (public, no auth)

---

## 🔄 Route Mapping Logic

### **User Buy Flow:**
```
User wants to BUY crypto
  → GET /api/p2p/user/ads/buy
  → Shows vendor SELL ads
  → User creates order: POST /api/p2p/user/orders
  → User is BUYER, Vendor is SELLER
```

### **User Sell Flow:**
```
User wants to SELL crypto
  → GET /api/p2p/user/ads/sell
  → Shows vendor BUY ads
  → User creates order: POST /api/p2p/user/orders
  → User is SELLER, Vendor is BUYER
```

---

## 📊 Complete Route List

| Method | Route | Who | Purpose |
|--------|-------|-----|---------|
| **PUBLIC** |
| GET | `/api/p2p/ads/browse` | Public | Browse all ads |
| GET | `/api/p2p/ads/:id` | Public | Get ad details |
| **USER ROUTES** |
| GET | `/api/p2p/user/ads/buy` | User | Browse ads to buy (vendor sell ads) |
| GET | `/api/p2p/user/ads/sell` | User | Browse ads to sell (vendor buy ads) |
| POST | `/api/p2p/user/orders` | User | Create order |
| GET | `/api/p2p/user/orders` | User | Get my orders (as buyer) |
| GET | `/api/p2p/user/orders/:id` | User | Get order details |
| POST | `/api/p2p/user/orders/:id/payment-made` | User | Confirm payment made |
| POST | `/api/p2p/user/orders/:id/cancel` | User | Cancel my order |
| **VENDOR ROUTES** |
| GET | `/api/p2p/vendor/orders` | Vendor | Get my vendor orders |
| GET | `/api/p2p/vendor/orders/:id` | Vendor | Get order details |
| POST | `/api/p2p/vendor/orders/:id/accept` | Vendor | Accept order |
| POST | `/api/p2p/vendor/orders/:id/decline` | Vendor | Decline order |
| POST | `/api/p2p/vendor/orders/:id/payment-received` | Vendor | Mark payment received |
| POST | `/api/p2p/vendor/orders/:id/cancel` | Vendor | Cancel order |

---

## 🎨 Frontend Integration Guide

### **For "Buy" Tab:**
```typescript
// User wants to buy crypto
GET /api/p2p/user/ads/buy?cryptoCurrency=USDT&fiatCurrency=NGN
// Response: List of vendor SELL ads
// userAction: "buy" for all ads
```

### **For "Sell" Tab:**
```typescript
// User wants to sell crypto
GET /api/p2p/user/ads/sell?cryptoCurrency=USDT&fiatCurrency=NGN
// Response: List of vendor BUY ads
// userAction: "sell" for all ads
```

### **For Vendor Dashboard:**
```typescript
// Get orders for my ads
GET /api/p2p/vendor/orders?status=pending
// Response: Orders where I am vendor (ad owner)
```

### **For User Orders Page:**
```typescript
// Get my orders (where I created the order)
GET /api/p2p/user/orders?status=awaiting_payment
// Response: Orders where I am buyer (order creator)
```

---

## ✅ Key Points

1. **User routes** = Order creators (buyers/sellers)
2. **Vendor routes** = Ad owners
3. **User buy** = Shows vendor sell ads
4. **User sell** = Shows vendor buy ads
5. All routes are clearly separated by role
6. Legacy routes still work for backward compatibility

---

**This structure makes it crystal clear who can do what!** 🚀


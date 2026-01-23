# P2P Trading Complete Implementation Guide

**Version:** 1.0  
**Last Updated:** January 23, 2025  
**For:** Frontend Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Database Schema](#database-schema)
4. [API Routes Reference](#api-routes-reference)
5. [Complete Order Flow](#complete-order-flow)
6. [Role Resolution System](#role-resolution-system)
7. [Order Status Lifecycle](#order-status-lifecycle)
8. [Payment Methods](#payment-methods)
9. [Frontend Implementation Guide](#frontend-implementation-guide)
10. [Error Handling](#error-handling)
11. [Testing Scenarios](#testing-scenarios)

---

## Overview

The P2P (Peer-to-Peer) trading system allows users to buy and sell cryptocurrencies directly with each other. The system follows a Binance/Bybit-style architecture where:

- **Vendors** create ads to buy or sell crypto
- **Users** browse ads and create orders
- Orders go through a status lifecycle until completion
- Both parties can communicate via in-app chat
- Reviews can be left after order completion

### Key Features

- ✅ Buy/Sell crypto ads
- ✅ Order management (create, accept, decline, cancel)
- ✅ Payment confirmation (offline & RhinoxPay ID)
- ✅ Crypto escrow system (frozen on acceptance)
- ✅ In-app chat for order communication
- ✅ Review system
- ✅ Auto-accept orders
- ✅ Payment method matching

---

## Core Concepts

### 1. Ad Types

**Vendor Perspective:**
- **BUY Ad**: Vendor wants to BUY crypto → User can SELL to vendor
- **SELL Ad**: Vendor wants to SELL crypto → User can BUY from vendor

**User Perspective (what they see):**
- **userAction: "sell"**: User can sell crypto (vendor has BUY ad)
- **userAction: "buy"**: User can buy crypto (vendor has SELL ad)

### 2. Order Participants

Every order has two participants:
- **Vendor**: The ad owner (who created the ad)
- **User**: The person who created the order

**Buyer/Seller roles are derived from ad type:**
- **BUY Ad**: Vendor = BUYER, User = SELLER
- **SELL Ad**: Vendor = SELLER, User = BUYER

**Important:** Crypto ALWAYS moves from SELLER → BUYER

### 3. Payment Channels

- **`offline`**: Manual bank transfer, mobile money, etc. (requires confirmation)
- **`rhinoxpay_id`**: Automatic payment via RhinoxPay wallet (instant)

---

## Database Schema

### P2POrder Model

```typescript
{
  id: number
  adId: number                    // Reference to P2PAd
  vendorId: number                // Ad owner (who created the ad)
  userId: number                  // User who created the order
  type: 'buy' | 'sell'           // Ad type (from ad perspective)
  cryptoCurrency: string          // e.g., "USDT", "BTC"
  fiatCurrency: string            // e.g., "NGN", "USD"
  cryptoAmount: Decimal           // Quantity of crypto
  fiatAmount: Decimal             // Total fiat amount
  price: Decimal                  // Price per 1 unit of crypto
  paymentMethodId: number | null  // Vendor's payment method ID
  status: string                  // See Order Status Lifecycle
  acceptedAt: DateTime | null
  expiresAt: DateTime | null      // Payment deadline
  paymentConfirmedAt: DateTime | null
  paymentReceivedAt: DateTime | null
  coinReleasedAt: DateTime | null
  completedAt: DateTime | null
  cancelledAt: DateTime | null
  txId: string | null
  paymentChannel: 'rhinoxpay_id' | 'offline' | null
  metadata: JSON | null           // Stores user payment method, roles, etc.
  createdAt: DateTime
  updatedAt: DateTime
}
```

### Key Relationships

- `vendorId` → `User.id` (ad owner)
- `userId` → `User.id` (order creator)
- `adId` → `P2PAd.id`
- `paymentMethodId` → `UserPaymentMethod.id` (vendor's payment method)

---

## API Routes Reference

### Base URL
- **Development**: `http://localhost:3000`
- **Production**: `https://rhinoxpay.hmstech.xyz`

### Authentication
All protected routes require JWT token in:
- **Header**: `Authorization: Bearer <token>`
- **Cookie**: `token=<token>`

---

## 1. PUBLIC ROUTES (No Auth Required)

### 1.1 Browse Ads
**GET** `/api/p2p/ads/browse`

Browse all available P2P ads (public market).

**Query Parameters:**
```typescript
{
  type?: 'buy' | 'sell'           // Filter by user action
  cryptoCurrency?: string         // e.g., "USDT"
  fiatCurrency?: string           // e.g., "NGN"
  countryCode?: string            // e.g., "NG"
  minPrice?: string               // Minimum price per unit
  maxPrice?: string               // Maximum price per unit
  limit?: number                  // Default: 50
  offset?: number                 // Default: 0
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "buy",              // Ad type (internal)
      "userAction": "sell",       // What user can do (use this for UI)
      "cryptoCurrency": "USDT",
      "fiatCurrency": "NGN",
      "price": "1550.70",
      "volume": "99.00",
      "minOrder": "1000.00",
      "maxOrder": "75000.00",
      "autoAccept": false,
      "paymentMethodIds": [1, 2],
      "paymentMethods": [         // Full payment method objects
        {
          "id": 1,
          "type": "bank_account",
          "bankName": "Sterling Bank",
          "accountNumber": "****59bf",
          "accountName": "John Doe"
        }
      ],
      "status": "available",
      "isOnline": true,
      "ordersReceived": 5,
      "responseTime": 5,
      "score": "95.50",
      "vendor": {
        "id": 2,
        "name": "John Doe",
        "email": "vendor@example.com",
        "phone": "+2341234567890"
      },
      "createdAt": "2025-01-22T10:00:00.000Z"
    }
  ]
}
```

**Important Notes:**
- `type` = "buy" means vendor has BUY ad → user sees as "sell" action
- `type` = "sell" means vendor has SELL ad → user sees as "buy" action
- Use `userAction` field for UI labels, not `type`

---

### 1.2 Get Ad Details
**GET** `/api/p2p/ads/:id`

Get detailed information about a specific ad.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "type": "buy",
    "userAction": "sell",
    "cryptoCurrency": "USDT",
    "fiatCurrency": "NGN",
    "price": "1550.70",
    "volume": "99.00",
    "minOrder": "1000.00",
    "maxOrder": "75000.00",
    "autoAccept": false,
    "paymentMethods": [
      {
        "id": 1,
        "type": "bank_account",
        "bankName": "Sterling Bank",
        "accountNumber": "****59bf",
        "accountName": "John Doe",
        "provider": null
      }
    ],
    "vendor": {
      "id": 2,
      "name": "John Doe",
      "email": "vendor@example.com",
      "phone": "+2341234567890"
    },
    "ordersReceived": 5,
    "responseTime": 5,
    "processingTime": 30,
    "score": "95.50",
    "description": "Buy USDT at best rates"
  }
}
```

---

## 2. VENDOR ROUTES (Ad Management)

### 2.1 Create BUY Ad
**POST** `/api/p2p/ads/buy`

Vendor creates an ad to BUY crypto (users can sell to vendor).

**Request Body:**
```json
{
  "cryptoCurrency": "USDT",
  "fiatCurrency": "NGN",
  "price": "1500.00",
  "volume": "100.00",
  "minOrder": "1000.00",
  "maxOrder": "75000.00",
  "autoAccept": false,
  "paymentMethodIds": [1, 2],
  "countryCode": "NG",
  "description": "Buy USDT at best rates"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "type": "buy",
    "cryptoCurrency": "USDT",
    "fiatCurrency": "NGN",
    "price": "1500.00",
    "volume": "100.00",
    "minOrder": "1000.00",
    "maxOrder": "75000.00",
    "autoAccept": false,
    "paymentMethodIds": [1, 2],
    "status": "available",
    "isOnline": true,
    "ordersReceived": 0,
    "message": "Buy ad created successfully"
  }
}
```

---

### 2.2 Create SELL Ad
**POST** `/api/p2p/ads/sell`

Vendor creates an ad to SELL crypto (users can buy from vendor).

**Request Body:** Same as BUY ad

**Response:** Same format as BUY ad, but `type: "sell"`

---

### 2.3 Get My Ads
**GET** `/api/p2p/ads`

Get all ads created by the authenticated vendor.

**Query Parameters:**
```typescript
{
  type?: 'buy' | 'sell'
  status?: 'available' | 'unavailable' | 'paused'
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "buy",
      "cryptoCurrency": "USDT",
      "fiatCurrency": "NGN",
      "price": "1500.00",
      "volume": "100.00",
      "minOrder": "1000.00",
      "maxOrder": "75000.00",
      "autoAccept": false,
      "paymentMethodIds": [1, 2],
      "status": "available",
      "isOnline": true,
      "ordersReceived": 5
    }
  ]
}
```

---

### 2.4 Get Single Ad
**GET** `/api/p2p/ads/:id`

Get details of a specific ad (must be ad owner).

---

### 2.5 Update Ad Status
**PUT** `/api/p2p/ads/:id/status`

Update ad status (available/unavailable/paused).

**Request Body:**
```json
{
  "status": "paused"
}
```

---

### 2.6 Update Ad
**PUT** `/api/p2p/ads/:id`

Update ad details (price, volume, limits, etc.).

**Request Body:** Same as create ad (all fields optional)

---

## 3. USER ROUTES (Order Management)

### 3.1 Browse Ads to Buy
**GET** `/api/p2p/user/ads/buy`

Get ads where user can BUY crypto (vendor SELL ads).

**Query Parameters:** Same as public browse ads

---

### 3.2 Browse Ads to Sell
**GET** `/api/p2p/user/ads/sell`

Get ads where user can SELL crypto (vendor BUY ads).

**Query Parameters:** Same as public browse ads

---

### 3.3 Create Order
**POST** `/api/p2p/user/orders`  
**POST** `/api/p2p/orders` (legacy)

Create a new order from an ad.

**Request Body:**
```json
{
  "adId": 1,
  "cryptoAmount": "5.00",
  "paymentMethodId": 3
}
```

**Important:**
- `cryptoAmount`: Quantity of crypto user wants to buy/sell
- `paymentMethodId`: User's payment method ID (must match vendor's accepted methods)
  - System matches by bank name (case-insensitive) for bank accounts
  - System matches by provider ID for mobile money
  - System matches by type for RhinoxPay ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "adId": 1,
    "type": "buy",
    "userAction": "sell",
    "cryptoCurrency": "USDT",
    "fiatCurrency": "NGN",
    "cryptoAmount": "5.00",
    "fiatAmount": "7753.50",
    "price": "1550.70",
    "paymentMethodId": 1,
    "paymentChannel": "offline",
    "status": "pending",           // or "awaiting_payment" if auto-accept
    "buyer": {
      "id": 2,
      "firstName": "John",
      "lastName": "Doe",
      "email": "vendor@example.com"
    },
    "seller": {
      "id": 1,
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "user@example.com"
    },
    "vendor": {
      "id": 2,
      "firstName": "John",
      "lastName": "Doe",
      "email": "vendor@example.com"
    },
    "user": {
      "id": 1,
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "user@example.com"
    },
    "isUserBuyer": false,
    "isUserSeller": true,
    "paymentMethod": {
      "id": 1,
      "type": "bank_account",
      "bankName": "Sterling Bank",
      "accountNumber": "****59bf",
      "accountName": "John Doe"
    },
    "createdAt": "2025-01-22T10:00:00.000Z"
  }
}
```

**Status After Creation:**
- `pending`: Vendor must manually accept (most common)
- `awaiting_payment`: Ad has `autoAccept: true` → buyer can pay immediately

---

### 3.4 Get My Orders
**GET** `/api/p2p/user/orders`  
**GET** `/api/p2p/orders` (legacy)

Get all orders where user is involved (as vendor or order creator).

**Query Parameters:**
```typescript
{
  role?: 'vendor' | 'user'        // Filter by role
  status?: string                 // Filter by status
  limit?: number                   // Default: 50
  offset?: number                  // Default: 0
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "adId": 1,
      "type": "buy",
      "userAction": "sell",
      "cryptoCurrency": "USDT",
      "fiatCurrency": "NGN",
      "cryptoAmount": "5.00",
      "fiatAmount": "7753.50",
      "price": "1550.70",
      "status": "pending",
      "buyer": { "id": 2, "name": "John Doe" },
      "seller": { "id": 1, "name": "Jane Smith" },
      "vendor": { "id": 2, "name": "John Doe" },
      "user": { "id": 1, "name": "Jane Smith" },
      "isUserBuyer": false,
      "isUserSeller": true,
      "createdAt": "2025-01-22T10:00:00.000Z"
    }
  ]
}
```

---

### 3.5 Get Order Details
**GET** `/api/p2p/user/orders/:id`  
**GET** `/api/p2p/orders/:id` (legacy)

Get detailed information about a specific order.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "chatId": 1,
    "adId": 1,
    "type": "buy",
    "userAction": "sell",
    "cryptoCurrency": "USDT",
    "fiatCurrency": "NGN",
    "cryptoAmount": "5.00",
    "fiatAmount": "7753.50",
    "price": "1550.70",
    "paymentMethodId": 1,
    "paymentChannel": "offline",
    "status": "awaiting_payment",
    "acceptedAt": "2025-01-22T10:05:00.000Z",
    "expiresAt": "2025-01-22T10:35:00.000Z",
    "paymentConfirmedAt": null,
    "paymentReceivedAt": null,
    "coinReleasedAt": null,
    "completedAt": null,
    "buyer": {
      "id": 2,
      "firstName": "John",
      "lastName": "Doe",
      "email": "vendor@example.com",
      "phone": "+2341234567890"
    },
    "seller": {
      "id": 1,
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "user@example.com",
      "phone": "+2349876543210"
    },
    "vendor": { "id": 2, "name": "John Doe" },
    "user": { "id": 1, "name": "Jane Smith" },
    "isUserBuyer": false,
    "isUserSeller": true,
    "paymentMethod": {
      "id": 1,
      "type": "bank_account",
      "bankName": "Sterling Bank",
      "accountNumber": "****59bf",
      "accountName": "John Doe"
    },
    "chatMessages": [
      {
        "id": 1,
        "message": "Order created for 5 USDT at 1550.70 NGN per unit.",
        "senderId": 1,
        "sender": { "id": 1, "name": "Jane Smith" },
        "receiverId": 2,
        "isRead": true,
        "readAt": "2025-01-22T10:05:00.000Z",
        "createdAt": "2025-01-22T10:00:00.000Z"
      }
    ],
    "reviews": [],
    "createdAt": "2025-01-22T10:00:00.000Z",
    "updatedAt": "2025-01-22T10:05:00.000Z"
  }
}
```

---

### 3.6 Confirm Payment Made
**POST** `/api/p2p/user/orders/:id/payment-made`  
**POST** `/api/p2p/orders/:id/buyer/payment-made` (legacy)  
**POST** `/api/p2p/orders/:id/confirm-payment` (legacy)

Buyer confirms they have made the payment (offline payments only).

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "payment_made",
    "paymentConfirmedAt": "2025-01-22T10:10:00.000Z"
  }
}
```

**Status Transition:**
- `awaiting_payment` → `payment_made`

**Note:** For RhinoxPay ID, payment is automatic and this endpoint is not needed.

---

### 3.7 Mark Payment Received (User)
**POST** `/api/p2p/user/orders/:id/payment-received`

**Only for SELL ads where user is seller.** User marks payment as received.

**Note:** Usually vendor (seller) marks payment received, but this endpoint allows user (seller) to do it.

---

### 3.8 Cancel Order (User)
**POST** `/api/p2p/user/orders/:id/cancel`  
**POST** `/api/p2p/orders/:id/cancel` (legacy)

User cancels their order.

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "cancelled",
    "cancelledAt": "2025-01-22T10:15:00.000Z"
  }
}
```

**Can Cancel If:**
- Status is `pending` or `awaiting_payment`
- User is order creator or vendor

**If order was accepted:** Crypto is automatically unfrozen.

---

### 3.9 Get User P2P Profile
**GET** `/api/p2p/user/profile`

Get user's P2P profile with statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOrders": 25,
    "ordersAsBuyer": 10,
    "ordersAsVendor": 15,
    "completedOrders": 20,
    "pendingOrders": 3,
    "cancelledOrders": 2,
    "recentOrders": [...]
  }
}
```

---

## 4. VENDOR ROUTES (Order Management)

### 4.1 Get Vendor Orders
**GET** `/api/p2p/vendor/orders`

Get all orders for vendor's ads.

**Query Parameters:** Same as user orders

---

### 4.2 Accept Order
**POST** `/api/p2p/vendor/orders/:id/accept`  
**POST** `/api/p2p/orders/:id/vendor/accept` (legacy)  
**POST** `/api/p2p/orders/:id/accept` (legacy)

Vendor accepts a pending order.

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "awaiting_payment",
    "acceptedAt": "2025-01-22T10:05:00.000Z",
    "expiresAt": "2025-01-22T10:35:00.000Z"
  }
}
```

**What Happens:**
1. Seller's crypto is frozen (moved from availableBalance)
2. Order status changes to `awaiting_payment`
3. Expiration time is set (acceptedAt + processingTime)
4. Chat message is sent to buyer

**Status Transition:**
- `pending` → `awaiting_payment`

**Requirements:**
- Order status must be `pending`
- Seller must have sufficient crypto balance
- Only vendor (ad owner) can accept

---

### 4.3 Decline Order
**POST** `/api/p2p/vendor/orders/:id/decline`  
**POST** `/api/p2p/orders/:id/vendor/decline` (legacy)  
**POST** `/api/p2p/orders/:id/decline` (legacy)

Vendor declines a pending order.

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "cancelled",
    "cancelledAt": "2025-01-22T10:05:00.000Z"
  }
}
```

**Status Transition:**
- `pending` → `cancelled`

---

### 4.4 Mark Payment Received
**POST** `/api/p2p/vendor/orders/:id/payment-received`  
**POST** `/api/p2p/orders/:id/vendor/payment-received` (legacy)  
**POST** `/api/p2p/orders/:id/mark-paid` (legacy)

**Only for SELL ads where vendor is seller.** Vendor marks payment as received.

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "awaiting_coin_release",
    "paymentReceivedAt": "2025-01-22T10:15:00.000Z"
  }
}
```

**What Happens:**
1. Order status changes to `awaiting_coin_release`
2. Crypto is automatically released to buyer
3. Order status changes to `completed`

**Status Transition:**
- `payment_made` → `awaiting_coin_release` → `completed`

**Note:** Crypto release is automatic when payment is marked as received.

---

### 4.5 Mark Payment Made (Vendor)
**POST** `/api/p2p/vendor/orders/:id/payment-made`

**Only for BUY ads where vendor is buyer.** Vendor marks payment as made.

**Note:** Usually user (buyer) marks payment made, but this endpoint allows vendor (buyer) to do it.

---

### 4.6 Cancel Order (Vendor)
**POST** `/api/p2p/vendor/orders/:id/cancel`

Vendor cancels an order (same as user cancel).

---

## 5. CHAT ROUTES

### 5.1 Send Message
**POST** `/api/p2p/orders/:orderId/messages`

Send a chat message in an order.

**Request Body:**
```json
{
  "message": "I have made the payment. Please confirm receipt."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderId": 1,
    "senderId": 1,
    "sender": {
      "id": 1,
      "firstName": "Jane",
      "lastName": "Smith"
    },
    "receiverId": 2,
    "message": "I have made the payment. Please confirm receipt.",
    "isRead": false,
    "readAt": null,
    "createdAt": "2025-01-22T10:10:00.000Z"
  }
}
```

---

### 5.2 Get Chat Messages
**GET** `/api/p2p/orders/:orderId/messages`

Get all chat messages for an order.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "orderId": 1,
      "senderId": 1,
      "sender": { "id": 1, "name": "Jane Smith" },
      "receiverId": 2,
      "message": "Order created for 5 USDT...",
      "isRead": true,
      "readAt": "2025-01-22T10:05:00.000Z",
      "createdAt": "2025-01-22T10:00:00.000Z"
    }
  ]
}
```

---

### 5.3 Mark Messages as Read
**PUT** `/api/p2p/orders/:orderId/messages/read`

Mark all unread messages in an order as read.

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "message": "Messages marked as read"
}
```

---

### 5.4 Get Unread Count
**GET** `/api/p2p/chat/unread-count`

Get total unread message count for authenticated user.

**Response:**
```json
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

---

## 6. REVIEW ROUTES

### 6.1 Get Vendor Reviews
**GET** `/api/p2p/vendors/:vendorId/reviews`

Get all reviews for a vendor (public).

**Query Parameters:**
```typescript
{
  limit?: number
  offset?: number
}
```

---

### 6.2 Get Ad Reviews
**GET** `/api/p2p/ads/:adId/reviews`

Get all reviews for an ad (public).

---

### 6.3 Create Review
**POST** `/api/p2p/orders/:orderId/review`

Create a review after order completion (only buyer can review).

**Request Body:**
```json
{
  "type": "positive",        // or "negative"
  "comment": "Great seller, fast transaction!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderId": 1,
    "reviewerId": 1,
    "revieweeId": 2,
    "adId": 1,
    "type": "positive",
    "comment": "Great seller, fast transaction!",
    "createdAt": "2025-01-22T11:00:00.000Z"
  }
}
```

**Requirements:**
- Order must be `completed`
- Only buyer can leave review
- One review per order

---

### 6.4 Update Review
**PUT** `/api/p2p/reviews/:id`

Update a review (only reviewer can update).

---

### 6.5 Delete Review
**DELETE** `/api/p2p/reviews/:id`

Delete a review (only reviewer can delete).

---

## Complete Order Flow

### Flow Diagram

```
1. USER BROWSES ADS
   GET /api/p2p/ads/browse?type=buy&cryptoCurrency=USDT
   → Sees vendor BUY ads (user can sell)

2. USER VIEWS AD DETAILS
   GET /api/p2p/ads/1
   → Sees payment methods, vendor info, limits

3. USER CREATES ORDER
   POST /api/p2p/user/orders
   {
     "adId": 1,
     "cryptoAmount": "5.00",
     "paymentMethodId": 3
   }
   → Status: "pending" (or "awaiting_payment" if auto-accept)

4. VENDOR ACCEPTS ORDER (if not auto-accept)
   POST /api/p2p/vendor/orders/1/accept
   → Status: "awaiting_payment"
   → Crypto frozen from seller
   → Expiration time set

5. BUYER MAKES PAYMENT
   → For offline: Buyer transfers money externally
   → For RhinoxPay ID: Automatic (skip to step 7)

6. BUYER CONFIRMS PAYMENT (offline only)
   POST /api/p2p/user/orders/1/payment-made
   → Status: "payment_made"

7. SELLER MARKS PAYMENT RECEIVED (offline only)
   POST /api/p2p/vendor/orders/1/payment-received
   → Status: "awaiting_coin_release"
   → Crypto automatically released
   → Status: "completed"

8. ORDER COMPLETED
   → Both parties can leave reviews
   → Chat remains accessible
```

---

## Role Resolution System

### How It Works

The system uses `vendorId` and `userId` to derive buyer/seller roles:

```typescript
function resolveRoles(adType: string, vendorId: string, userId: string) {
  if (adType === 'buy') {
    // Vendor BUY ad: Vendor wants to BUY crypto
    // Vendor is BUYER, User is SELLER
    return { buyerId: vendorId, sellerId: userId };
  } else {
    // Vendor SELL ad: Vendor wants to SELL crypto
    // Vendor is SELLER, User is BUYER
    return { buyerId: userId, sellerId: vendorId };
  }
}
```

### Examples

**Example 1: Vendor BUY Ad**
- Vendor (ID: 2) creates BUY ad
- User (ID: 1) creates order
- Result: Vendor = BUYER, User = SELLER
- Crypto moves: User → Vendor

**Example 2: Vendor SELL Ad**
- Vendor (ID: 2) creates SELL ad
- User (ID: 1) creates order
- Result: Vendor = SELLER, User = BUYER
- Crypto moves: Vendor → User

### Frontend Usage

Use `isUserBuyer` and `isUserSeller` flags from order response:

```typescript
if (order.isUserBuyer) {
  // User is buyer → Show "Make Payment" button
  // User pays fiat, receives crypto
}

if (order.isUserSeller) {
  // User is seller → Show "Release Crypto" button (auto)
  // User receives fiat, sends crypto
}
```

---

## Order Status Lifecycle

### Status Flow Diagram

```
pending
  ↓ (vendor accepts)
awaiting_payment
  ↓ (buyer confirms payment - offline)
payment_made
  ↓ (seller marks received - offline)
awaiting_coin_release
  ↓ (auto: crypto released)
completed

OR (for RhinoxPay ID):

pending
  ↓ (vendor accepts)
awaiting_payment
  ↓ (buyer confirms - automatic payment)
awaiting_coin_release
  ↓ (auto: crypto released)
completed

OR (cancellation):

pending / awaiting_payment
  ↓ (user/vendor cancels)
cancelled
```

### Status Descriptions

| Status | Description | Who Can Act | Next Actions |
|--------|-------------|-------------|--------------|
| `pending` | Order created, waiting for vendor acceptance | Vendor | Accept or Decline |
| `awaiting_payment` | Order accepted, buyer must pay | Buyer | Confirm payment made |
| `payment_made` | Buyer confirmed payment (offline only) | Seller | Mark payment received |
| `awaiting_coin_release` | Payment received, crypto ready to release | System | Auto-release crypto |
| `completed` | Order completed successfully | Both | Leave review |
| `cancelled` | Order cancelled | - | - |

### Status Transitions

**Valid Transitions:**
- `pending` → `awaiting_payment` (vendor accepts)
- `pending` → `cancelled` (vendor declines or user cancels)
- `awaiting_payment` → `payment_made` (buyer confirms - offline)
- `awaiting_payment` → `awaiting_coin_release` (buyer confirms - RhinoxPay ID)
- `awaiting_payment` → `cancelled` (user/vendor cancels)
- `payment_made` → `awaiting_coin_release` (seller marks received)
- `awaiting_coin_release` → `completed` (crypto released)

**Invalid Transitions:**
- Cannot accept if not `pending`
- Cannot confirm payment if not `awaiting_payment`
- Cannot mark received if not `payment_made`
- Cannot cancel if status is `payment_made` or later

---

## Payment Methods

### Payment Method Matching

When creating an order, user provides their payment method ID. System matches it with vendor's accepted payment methods:

**For Bank Accounts:**
- Matches by `bankName` (case-insensitive)
- Example: User's "Sterling Bank" matches Vendor's "STERLING BANK"

**For Mobile Money:**
- Matches by `providerId`
- Example: User's MTN matches Vendor's MTN

**For RhinoxPay ID:**
- Matches by `type` = "rhinoxpay_id"
- Example: User's RhinoxPay ID matches Vendor's RhinoxPay ID

**Important:** User's payment method must match one of vendor's accepted methods.

### Payment Channels

**Offline Payment:**
- User transfers money externally (bank, mobile money)
- Buyer confirms payment made
- Seller marks payment received
- Crypto is released

**RhinoxPay ID Payment:**
- Payment is automatic (instant)
- Buyer's fiat wallet is debited
- Seller's fiat wallet is credited
- Crypto is automatically released
- No manual confirmation needed

---

## Frontend Implementation Guide

### 1. Browse Ads Screen

```typescript
// Fetch ads
const response = await fetch('/api/p2p/ads/browse?type=buy&cryptoCurrency=USDT', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data: ads } = await response.json();

// Display ads
ads.forEach(ad => {
  // Use ad.userAction for button label ("Buy" or "Sell")
  // Use ad.type for internal logic
  console.log(`User can ${ad.userAction} ${ad.cryptoCurrency}`);
});
```

### 2. Create Order Screen

```typescript
// User selects ad and enters crypto amount
const createOrder = async (adId: number, cryptoAmount: string, paymentMethodId: number) => {
  const response = await fetch('/api/p2p/user/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      adId,
      cryptoAmount,
      paymentMethodId
    })
  });
  
  const { data: order } = await response.json();
  
  // Check status
  if (order.status === 'pending') {
    // Show "Waiting for vendor acceptance" message
  } else if (order.status === 'awaiting_payment') {
    // Show "Make Payment" button
  }
};
```

### 3. Order Details Screen

```typescript
// Fetch order details
const response = await fetch(`/api/p2p/user/orders/${orderId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data: order } = await response.json();

// Determine user's role
if (order.isUserBuyer) {
  // User is buyer
  if (order.status === 'awaiting_payment') {
    // Show "Confirm Payment Made" button
  }
} else if (order.isUserSeller) {
  // User is seller
  if (order.status === 'payment_made') {
    // Show "Mark Payment Received" button (if vendor)
    // Or show "Waiting for vendor to confirm" (if user)
  }
}
```

### 4. Order Status UI

```typescript
const getStatusLabel = (status: string) => {
  const labels = {
    'pending': 'Waiting for acceptance',
    'awaiting_payment': 'Awaiting payment',
    'payment_made': 'Payment confirmed',
    'awaiting_coin_release': 'Releasing crypto',
    'completed': 'Completed',
    'cancelled': 'Cancelled'
  };
  return labels[status] || status;
};

const getStatusColor = (status: string) => {
  const colors = {
    'pending': 'orange',
    'awaiting_payment': 'blue',
    'payment_made': 'purple',
    'awaiting_coin_release': 'indigo',
    'completed': 'green',
    'cancelled': 'red'
  };
  return colors[status] || 'gray';
};
```

### 5. Payment Confirmation Flow

```typescript
// Buyer confirms payment (offline)
const confirmPayment = async (orderId: number) => {
  const response = await fetch(`/api/p2p/user/orders/${orderId}/payment-made`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { data } = await response.json();
  // Status changes to "payment_made"
};

// Seller marks payment received (offline)
const markPaymentReceived = async (orderId: number) => {
  const response = await fetch(`/api/p2p/vendor/orders/${orderId}/payment-received`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { data } = await response.json();
  // Status changes to "awaiting_coin_release" then "completed"
};
```

### 6. Chat Integration

```typescript
// Send message
const sendMessage = async (orderId: number, message: string) => {
  const response = await fetch(`/api/p2p/orders/${orderId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
};

// Get messages (poll or WebSocket)
const getMessages = async (orderId: number) => {
  const response = await fetch(`/api/p2p/orders/${orderId}/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { data: messages } = await response.json();
  return messages;
};
```

---

## Error Handling

### Common Errors

| Error Message | Status Code | Cause | Solution |
|---------------|-------------|-------|----------|
| "Ad not found" | 404 | Invalid ad ID | Check ad ID |
| "Ad is not available" | 400 | Ad status is not "available" | Ad may be paused/unavailable |
| "Payment method not accepted for this ad" | 400 | User's payment method doesn't match vendor's | Select matching payment method |
| "Insufficient crypto balance available" | 400 | Seller doesn't have enough crypto | Seller needs to deposit crypto |
| "Maximum order amount exceeds vendor's available balance" | 400 | Order amount too high | Reduce order amount |
| "Cannot accept order. Current status: X" | 400 | Wrong status for action | Check order status |
| "Unauthorized to view this order" | 403 | User not part of order | Check user ID |
| "Only buyer can confirm payment" | 403 | Wrong user role | Check isUserBuyer flag |
| "Only seller can mark payment as received" | 403 | Wrong user role | Check isUserSeller flag |

### Error Response Format

```json
{
  "success": false,
  "message": "Error message here"
}
```

---

## Testing Scenarios

### Scenario 1: User Sells Crypto (Vendor BUY Ad)

1. Vendor creates BUY ad
2. User browses and sees ad with `userAction: "sell"`
3. User creates order → `status: "pending"`
4. Vendor accepts → `status: "awaiting_payment"`
5. Vendor (buyer) makes payment offline
6. Vendor confirms payment → `status: "payment_made"`
7. User (seller) marks received → `status: "awaiting_coin_release"`
8. Crypto auto-released → `status: "completed"`

### Scenario 2: User Buys Crypto (Vendor SELL Ad)

1. Vendor creates SELL ad
2. User browses and sees ad with `userAction: "buy"`
3. User creates order → `status: "pending"`
4. Vendor accepts → `status: "awaiting_payment"`
5. User (buyer) makes payment offline
6. User confirms payment → `status: "payment_made"`
7. Vendor (seller) marks received → `status: "awaiting_coin_release"`
8. Crypto auto-released → `status: "completed"`

### Scenario 3: RhinoxPay ID Payment (Auto)

1. User creates order with RhinoxPay ID payment method
2. Vendor accepts → `status: "awaiting_payment"`
3. User confirms payment → Automatic transfer
4. Crypto auto-released → `status: "completed"`

### Scenario 4: Auto-Accept Order

1. Vendor creates ad with `autoAccept: true`
2. User creates order → `status: "awaiting_payment"` (skips pending)
3. User confirms payment → Continue flow

---

## Migration Guide

### Running the Migration

**For Production:**
```bash
cd backend
npx prisma migrate deploy
```

**For Development:**
```bash
cd backend
npx prisma migrate dev
```

**Note:** The migration file has been created at:
`backend/prisma/migrations/20260123052633_replace_buyer_seller_with_vendor_user/migration.sql`

### Migration Details

**Migration Name:** `20260123052633_replace_buyer_seller_with_vendor_user`

**Changes:**
1. Adds `user_id` column to `p2p_orders` (nullable first)
2. Populates `user_id` from existing `buyer_id`
3. Makes `user_id` NOT NULL
4. Adds foreign key constraint: `p2p_orders_user_id_fkey`
5. Adds index: `p2p_orders_user_id_idx`
6. Drops old index: `p2p_orders_buyer_id_idx`
7. Drops foreign key: `p2p_orders_buyer_id_fkey`
8. Drops `buyer_id` column

**Important:** 
- Existing orders will have `user_id` set to the previous `buyer_id`
- This is correct for SELL ads (buyerId = userId)
- For BUY ads where `buyer_id` was the vendor, `user_id` will also be set to vendor (may need manual correction if you have existing BUY ad orders)
- New orders will correctly use `vendorId` and `userId`

### Verifying Migration

After running the migration, verify the schema:

```bash
npx prisma db pull
npx prisma generate
```

Check that:
- `p2p_orders` table has `user_id` column
- `p2p_orders` table does NOT have `buyer_id` or `seller_id` columns
- Foreign keys and indexes are created correctly

---

## Quick Reference

### Order Status Quick Lookup

```typescript
const STATUS_FLOW = {
  pending: {
    next: ['awaiting_payment', 'cancelled'],
    action: 'Vendor accepts/declines'
  },
  awaiting_payment: {
    next: ['payment_made', 'awaiting_coin_release', 'cancelled'],
    action: 'Buyer confirms payment'
  },
  payment_made: {
    next: ['awaiting_coin_release'],
    action: 'Seller marks received'
  },
  awaiting_coin_release: {
    next: ['completed'],
    action: 'Auto-release crypto'
  },
  completed: {
    next: [],
    action: 'Leave review'
  },
  cancelled: {
    next: [],
    action: 'None'
  }
};
```

### Role Quick Reference

```typescript
// BUY Ad (vendor wants to buy)
vendorId = buyerId
userId = sellerId
// Crypto: User → Vendor

// SELL Ad (vendor wants to sell)
vendorId = sellerId
userId = buyerId
// Crypto: Vendor → User
```

---

## Support

For questions or issues:
- Check Swagger documentation: `/api/documentation`
- Review this guide
- Contact backend team

---

**End of Guide**

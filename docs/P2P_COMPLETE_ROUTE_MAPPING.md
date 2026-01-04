# P2P Complete Route Mapping - Vendor vs User

## 📋 Complete Route List Organized by Role and Screen

---

## 🏪 VENDOR ROUTES (Ad Owners)

### **Vendor Ad Management**

| Method | Route | UI Screen | Purpose |
|--------|-------|-----------|---------|
| POST | `/api/p2p/ads/buy` | Vendor Dashboard → Create Ad → Buy Ad | Create BUY ad (I want to buy crypto) |
| POST | `/api/p2p/ads/sell` | Vendor Dashboard → Create Ad → Sell Ad | Create SELL ad (I want to sell crypto) |
| GET | `/api/p2p/ads` | Vendor Dashboard → My Ads | Get all my ads (buy + sell) |
| GET | `/api/p2p/ads/:id` | Vendor Dashboard → My Ads → Ad Details | Get one of my ads details |
| PUT | `/api/p2p/ads/:id` | Vendor Dashboard → My Ads → Edit Ad | Edit ad details |
| PUT | `/api/p2p/ads/:id/status` | Vendor Dashboard → My Ads → Toggle Status | Update ad status (available/unavailable) |

### **Vendor Order Management**

| Method | Route | UI Screen | Purpose |
|--------|-------|-----------|---------|
| GET | `/api/p2p/vendor/orders` | Vendor Dashboard → Orders | Get orders for my ads |
| GET | `/api/p2p/vendor/orders/:id` | Vendor Dashboard → Orders → Order Details | Get order details |
| POST | `/api/p2p/vendor/orders/:id/accept` | Vendor Dashboard → Orders → Order Details → Accept | Accept pending order |
| POST | `/api/p2p/vendor/orders/:id/decline` | Vendor Dashboard → Orders → Order Details → Decline | Decline pending order |
| POST | `/api/p2p/vendor/orders/:id/payment-received` | Vendor Dashboard → Orders → Order Details → Mark Paid | Mark payment received (offline) |
| POST | `/api/p2p/vendor/orders/:id/cancel` | Vendor Dashboard → Orders → Order Details → Cancel | Cancel order (as vendor) |

---

## 👤 USER ROUTES (Order Creators - Buyers/Sellers)

### **User Browse Ads**

| Method | Route | UI Screen | Purpose |
|--------|-------|-----------|---------|
| GET | `/api/p2p/user/ads/buy` | P2P Market → Buy Tab | Browse ads to BUY crypto (shows vendor SELL ads) |
| GET | `/api/p2p/user/ads/sell` | P2P Market → Sell Tab | Browse ads to SELL crypto (shows vendor BUY ads) |
| GET | `/api/p2p/ads/:id` | Browse Ads → Tap Ad → Ad Details | View ad details before creating order |

### **User Order Management**

| Method | Route | UI Screen | Purpose |
|--------|-------|-----------|---------|
| POST | `/api/p2p/user/orders` | Ad Details → Enter Amount → Apply | Create order from ad |
| GET | `/api/p2p/user/orders` | User Dashboard → My Orders | Get my orders (where I am buyer) |
| GET | `/api/p2p/user/orders/:id` | My Orders → Tap Order → Order Details | Get order details |
| POST | `/api/p2p/user/orders/:id/payment-made` | Order Details → Awaiting Payment → Payment Made | Confirm payment made |
| POST | `/api/p2p/user/orders/:id/cancel` | Order Details → Cancel | Cancel my order |

---

## 🌐 PUBLIC ROUTES (No Authentication)

| Method | Route | UI Screen | Purpose |
|--------|-------|-----------|---------|
| GET | `/api/p2p/ads/browse` | P2P Market (Public) | Browse all available ads |
| GET | `/api/p2p/ads/:id` | Browse Ads → Tap Ad | Get ad details (public) |

---

## 🔄 Complete Flow Mapping

### **Vendor Flow:**

1. **Create Ad:**
   - `POST /api/p2p/ads/buy` or `POST /api/p2p/ads/sell`
   - Screen: Vendor Dashboard → Create Ad

2. **View My Ads:**
   - `GET /api/p2p/ads`
   - Screen: Vendor Dashboard → My Ads

3. **View Ad Details:**
   - `GET /api/p2p/ads/:id`
   - Screen: My Ads → Tap Ad → Ad Details

4. **Edit Ad:**
   - `PUT /api/p2p/ads/:id`
   - Screen: Ad Details → Edit

5. **Update Ad Status:**
   - `PUT /api/p2p/ads/:id/status`
   - Screen: Ad Details → Toggle Available/Unavailable

6. **View Orders for My Ads:**
   - `GET /api/p2p/vendor/orders`
   - Screen: Vendor Dashboard → Orders

7. **Accept Order:**
   - `POST /api/p2p/vendor/orders/:id/accept`
   - Screen: Orders → Order Details → Accept

8. **Mark Payment Received:**
   - `POST /api/p2p/vendor/orders/:id/payment-received`
   - Screen: Orders → Order Details → Mark Paid

### **User Flow:**

1. **Browse Ads to Buy:**
   - `GET /api/p2p/user/ads/buy`
   - Screen: P2P Market → Buy Tab

2. **Browse Ads to Sell:**
   - `GET /api/p2p/user/ads/sell`
   - Screen: P2P Market → Sell Tab

3. **View Ad Details:**
   - `GET /api/p2p/ads/:id`
   - Screen: Browse Ads → Tap Ad → Ad Details

4. **Create Order:**
   - `POST /api/p2p/user/orders`
   - Screen: Ad Details → Enter Amount → Apply

5. **View My Orders:**
   - `GET /api/p2p/user/orders`
   - Screen: User Dashboard → My Orders

6. **Confirm Payment:**
   - `POST /api/p2p/user/orders/:id/payment-made`
   - Screen: Order Details → Awaiting Payment → Payment Made

---

## 📊 Route Categories Summary

### **Vendor Routes:**
- Ad Management: 6 routes
- Order Management: 6 routes
- **Total: 12 routes**

### **User Routes:**
- Browse Ads: 3 routes
- Order Management: 5 routes
- **Total: 8 routes**

### **Public Routes:**
- Browse Ads: 2 routes
- **Total: 2 routes**

---

## ✅ Key Points

1. **Vendor routes** start with `/api/p2p/ads/*` (ad management) and `/api/p2p/vendor/orders/*` (order management)
2. **User routes** start with `/api/p2p/user/ads/*` (browse) and `/api/p2p/user/orders/*` (orders)
3. **Public routes** are `/api/p2p/ads/browse` and `/api/p2p/ads/:id`
4. All routes are clearly separated by role
5. Each route maps to a specific UI screen

---

**This structure makes it crystal clear which routes to use for each screen!** 🚀


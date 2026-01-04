# Bill Payment API Documentation

This document explains the complete bill payment flow and all endpoints with their parameters.

## Overview

The bill payment system supports 6 types of bills:
1. **Airtime** - Mobile airtime recharge
2. **Data** - Mobile data bundles
3. **Electricity** - Electricity bill payments (prepaid/postpaid)
4. **Cable TV** - Cable TV and streaming subscriptions
5. **Betting** - Sports betting platform funding
6. **Internet** - Internet router subscriptions (for future use)

## General Flow

```
1. Get Categories → 2. Get Providers → 3. (Optional) Get Plans → 4. (Optional) Validate Account/Meter → 5. Initiate Payment → 6. Confirm Payment
```

---

## Endpoint 1: Get Categories

**Endpoint:** `GET /api/bill-payment/categories`

**Purpose:** Get all available bill payment categories

**Parameters:** None (query or body)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "code": "airtime",
      "name": "Airtime",
      "description": "Mobile airtime recharge"
    },
    {
      "id": 2,
      "code": "data",
      "name": "Data",
      "description": "Mobile data plans and bundles"
    }
    // ... more categories
  ]
}
```

**When to use:** First step - to see what types of bills are available

---

## Endpoint 2: Get Providers by Category

**Endpoint:** `GET /api/bill-payment/providers`

**Purpose:** Get providers for a specific category (e.g., MTN, GLO for airtime)

**Query Parameters:**
- `categoryCode` (required) - Category code from Endpoint 1 (e.g., "airtime", "data", "electricity")
- `countryCode` (optional) - Country code (e.g., "NG", "KE") - defaults to all countries

**Example Request:**
```
GET /api/bill-payment/providers?categoryCode=airtime&countryCode=NG
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "code": "MTN",
      "name": "MTN",
      "logoUrl": "/uploads/billpayments/mtn.png",
      "countryCode": "NG",
      "currency": "NGN",
      "category": {
        "id": 1,
        "code": "airtime",
        "name": "Airtime"
      }
    }
    // ... more providers
  ]
}
```

**When to use:** After selecting a category, to see available providers (MTN, GLO, etc.)

---

## Endpoint 3: Get Plans/Bundles (For Data & Cable TV only)

**Endpoint:** `GET /api/bill-payment/plans`

**Purpose:** Get available plans/bundles for a provider (only needed for Data and Cable TV)

**Query Parameters:**
- `providerId` (required) - Provider ID from Endpoint 2

**Example Request:**
```
GET /api/bill-payment/plans?providerId=1
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "code": "MTN_1GB",
      "name": "1GB",
      "amount": "1000",
      "currency": "NGN",
      "dataAmount": "1GB",
      "validity": "30 days"
    }
    // ... more plans
  ]
}
```

**When to use:** 
- **For Data:** After selecting provider, to choose a data bundle
- **For Cable TV:** After selecting provider, to choose a subscription plan
- **For Airtime:** NOT needed (user enters custom amount)
- **For Electricity:** NOT needed (user enters custom amount)
- **For Betting:** NOT needed (user enters custom amount)

---

## Endpoint 4: Validate Meter Number (Electricity only)

**Endpoint:** `POST /api/bill-payment/validate-meter`

**Purpose:** Validate electricity meter number before payment

**Request Body:**
```json
{
  "providerId": 7,           // Required - Provider ID (Ikeja, Ibadan, Abuja)
  "meterNumber": "1234567890", // Required - Meter number to validate
  "accountType": "prepaid"   // Required - "prepaid" or "postpaid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "accountName": "John Doe",  // Account holder name
    "meterNumber": "1234567890",
    "accountType": "prepaid",
    "provider": {
      "id": 7,
      "name": "Ikeja Electric",
      "code": "IKEJA"
    }
  }
}
```

**When to use:** Only for Electricity - validate meter before initiating payment

---

## Endpoint 5: Validate Account Number (Betting only)

**Endpoint:** `POST /api/bill-payment/validate-account`

**Purpose:** Validate betting account number before payment

**Request Body:**
```json
{
  "providerId": 13,          // Required - Provider ID (1xBet, Bet9ja, SportBet)
  "accountNumber": "12345"   // Required - Betting account number
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "accountNumber": "12345",
    "provider": {
      "id": 13,
      "name": "1xBet",
      "code": "1XBET"
    }
  }
}
```

**When to use:** Only for Betting - validate account before initiating payment

---

## Endpoint 6: Get Beneficiaries (Optional - for saved recipients)

**Endpoint:** `GET /api/bill-payment/beneficiaries`

**Purpose:** Get user's saved beneficiaries (saved phone numbers, meter numbers, etc.)

**Query Parameters:**
- `categoryCode` (optional) - Filter by category (e.g., "airtime", "data")

**Example Request:**
```
GET /api/bill-payment/beneficiaries?categoryCode=airtime
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "My Phone",
      "accountNumber": "08012345678",
      "accountType": null,
      "category": {
        "id": 1,
        "code": "airtime",
        "name": "Airtime"
      },
      "provider": {
        "id": 1,
        "code": "MTN",
        "name": "MTN",
        "logoUrl": "/uploads/billpayments/mtn.png"
      }
    }
    // ... more beneficiaries
  ]
}
```

**When to use:** Optional - to show user's saved beneficiaries so they can select instead of typing

---

## Endpoint 7: Create Beneficiary (Optional)

**Endpoint:** `POST /api/bill-payment/beneficiaries`

**Purpose:** Save a beneficiary for future use

**Request Body:**
```json
{
  "categoryCode": "airtime",      // Required - Category code
  "providerId": 1,                // Required - Provider ID
  "name": "My Phone",             // Optional - Friendly name
  "accountNumber": "08012345678", // Required - Phone number, meter number, etc.
  "accountType": null             // Optional - "prepaid" or "postpaid" (for electricity)
}
```

**When to use:** Optional - to save a beneficiary after successful payment or manually

---

## Endpoint 8: Initiate Bill Payment

**Endpoint:** `POST /api/bill-payment/initiate`

**Purpose:** Get payment summary WITHOUT creating transaction (preview before payment)

**Request Body Parameters:**

### Common Parameters (All Categories):
- `categoryCode` (required) - Category code from Endpoint 1
- `providerId` (required) - Provider ID from Endpoint 2
- `currency` (required) - Wallet currency (e.g., "NGN", "USD")
- `amount` (required) - Payment amount (use plan amount for Data/Cable TV)
- `accountNumber` (optional) - Account number (phone, meter, etc.) OR use beneficiaryId
- `beneficiaryId` (optional) - Saved beneficiary ID from Endpoint 6 (instead of accountNumber)
- `accountType` (optional) - "prepaid" or "postpaid" (for Electricity only)
- `planId` (optional) - Plan ID from Endpoint 3 (for Data and Cable TV only)

### Category-Specific Requirements:

#### 1. Airtime
```json
{
  "categoryCode": "airtime",
  "providerId": 1,              // MTN, GLO, or Airtel ID
  "currency": "NGN",
  "amount": "1000",             // User enters amount
  "accountNumber": "08012345678" // Phone number
}
```

#### 2. Data
```json
{
  "categoryCode": "data",
  "providerId": 1,              // MTN, GLO, or Airtel ID
  "currency": "NGN",
  "amount": "1000",             // Optional - will use plan amount if planId provided
  "planId": 4,                  // REQUIRED - Data bundle plan ID
  "accountNumber": "08012345678" // Phone number
}
```

#### 3. Electricity
```json
{
  "categoryCode": "electricity",
  "providerId": 7,              // Ikeja, Ibadan, or Abuja ID
  "currency": "NGN",
  "amount": "5000",             // User enters amount
  "accountNumber": "1234567890", // Meter number
  "accountType": "prepaid"      // REQUIRED - "prepaid" or "postpaid"
}
```

#### 4. Cable TV
```json
{
  "categoryCode": "cable_tv",
  "providerId": 10,             // DSTV, Showmax, GOtv ID
  "currency": "NGN",
  "amount": "7900",             // Optional - will use plan amount if planId provided
  "planId": 25,                 // REQUIRED - Cable TV plan ID
  "accountNumber": "1234567890" // Smart card number or account number
}
```

#### 5. Betting
```json
{
  "categoryCode": "betting",
  "providerId": 13,             // 1xBet, Bet9ja, SportBet ID
  "currency": "NGN",
  "amount": "5000",             // User enters amount
  "accountNumber": "12345"      // Betting account number
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "category": {
      "id": 1,
      "code": "airtime",
      "name": "Airtime"
    },
    "provider": {
      "id": 1,
      "code": "MTN",
      "name": "MTN",
      "logoUrl": "/uploads/billpayments/mtn.png"
    },
    "plan": null,               // Only for Data/Cable TV
    "accountNumber": "08012345678",
    "accountName": null,        // Only for Electricity (after validation)
    "accountType": null,        // Only for Electricity
    "amount": "1000",
    "currency": "NGN",
    "fee": "10",
    "totalAmount": "1010",      // amount + fee
    "wallet": {
      "id": 1,
      "currency": "NGN",
      "balance": "50000"
    }
  }
}
```

**When to use:** After all selections, to show user a summary before confirming payment (NO transaction is created)

---

## Endpoint 9: Confirm Bill Payment

**Endpoint:** `POST /api/bill-payment/confirm`

**Purpose:** Complete the payment and create transaction in database

**Request Body:** Same as Endpoint 8, BUT with additional parameter:
- `pin` (required) - User's PIN for authorization

**Example (Airtime):**
```json
{
  "categoryCode": "airtime",
  "providerId": 1,
  "currency": "NGN",
  "amount": "1000",
  "accountNumber": "08012345678",
  "pin": "1234"                 // REQUIRED - User PIN
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "reference": "BILLABC123XYZ",
    "status": "completed",
    "amount": "1000",
    "currency": "NGN",
    "fee": "10",
    "totalAmount": "1010",
    "accountNumber": "08012345678",
    "accountName": null,
    "rechargeToken": null,      // Only for prepaid electricity
    "category": {
      "code": "airtime",
      "name": "Airtime"
    },
    "provider": {
      "id": 1,
      "code": "MTN",
      "name": "MTN"
    },
    "plan": null,
    "completedAt": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**When to use:** After user reviews summary from Endpoint 8 and confirms payment

---

## Complete Flow Examples

### Example 1: Airtime Payment

```
1. GET /api/bill-payment/categories
   → User sees "Airtime" category

2. GET /api/bill-payment/providers?categoryCode=airtime
   → User sees MTN, GLO, Airtel

3. POST /api/bill-payment/initiate
   Body: {
     "categoryCode": "airtime",
     "providerId": 1,        // MTN
     "currency": "NGN",
     "amount": "1000",
     "accountNumber": "08012345678"
   }
   → Shows summary (amount, fee, total)

4. POST /api/bill-payment/confirm
   Body: {
     "categoryCode": "airtime",
     "providerId": 1,
     "currency": "NGN",
     "amount": "1000",
     "accountNumber": "08012345678",
     "pin": "1234"
   }
   → Payment completed, transaction created
```

### Example 2: Data Bundle Payment

```
1. GET /api/bill-payment/categories
   → User sees "Data" category

2. GET /api/bill-payment/providers?categoryCode=data
   → User sees MTN, GLO, Airtel

3. GET /api/bill-payment/plans?providerId=1
   → User sees data bundles (100MB, 1GB, 2GB, etc.)

4. POST /api/bill-payment/initiate
   Body: {
     "categoryCode": "data",
     "providerId": 1,        // MTN
     "currency": "NGN",
     "planId": 4,            // 1GB plan
     "accountNumber": "08012345678"
     // amount is NOT needed - uses plan amount
   }
   → Shows summary with plan details

5. POST /api/bill-payment/confirm
   Body: {
     "categoryCode": "data",
     "providerId": 1,
     "currency": "NGN",
     "planId": 4,
     "accountNumber": "08012345678",
     "pin": "1234"
   }
   → Payment completed
```

### Example 3: Electricity Payment (Prepaid)

```
1. GET /api/bill-payment/categories
   → User sees "Electricity" category

2. GET /api/bill-payment/providers?categoryCode=electricity
   → User sees Ikeja, Ibadan, Abuja

3. POST /api/bill-payment/validate-meter
   Body: {
     "providerId": 7,        // Ikeja
     "meterNumber": "1234567890",
     "accountType": "prepaid"
   }
   → Returns account name validation

4. POST /api/bill-payment/initiate
   Body: {
     "categoryCode": "electricity",
     "providerId": 7,
     "currency": "NGN",
     "amount": "5000",
     "accountNumber": "1234567890",
     "accountType": "prepaid"
   }
   → Shows summary

5. POST /api/bill-payment/confirm
   Body: {
     "categoryCode": "electricity",
     "providerId": 7,
     "currency": "NGN",
     "amount": "5000",
     "accountNumber": "1234567890",
     "accountType": "prepaid",
     "pin": "1234"
   }
   → Payment completed, recharge token returned
```

### Example 4: Cable TV Payment

```
1. GET /api/bill-payment/categories
   → User sees "Cable TV" category

2. GET /api/bill-payment/providers?categoryCode=cable_tv
   → User sees DSTV, Showmax, GOtv

3. GET /api/bill-payment/plans?providerId=10
   → User sees subscription plans (Compact, Premium, etc.)

4. POST /api/bill-payment/initiate
   Body: {
     "categoryCode": "cable_tv",
     "providerId": 10,       // DSTV
     "currency": "NGN",
     "planId": 25,           // DSTV Compact
     "accountNumber": "1234567890"
   }
   → Shows summary

5. POST /api/bill-payment/confirm
   Body: {
     "categoryCode": "cable_tv",
     "providerId": 10,
     "currency": "NGN",
     "planId": 25,
     "accountNumber": "1234567890",
     "pin": "1234"
   }
   → Payment completed
```

### Example 5: Betting Payment

```
1. GET /api/bill-payment/categories
   → User sees "Betting" category

2. GET /api/bill-payment/providers?categoryCode=betting
   → User sees 1xBet, Bet9ja, SportBet

3. POST /api/bill-payment/validate-account
   Body: {
     "providerId": 13,       // 1xBet
     "accountNumber": "12345"
   }
   → Validates account

4. POST /api/bill-payment/initiate
   Body: {
     "categoryCode": "betting",
     "providerId": 13,
     "currency": "NGN",
     "amount": "5000",
     "accountNumber": "12345"
   }
   → Shows summary

5. POST /api/bill-payment/confirm
   Body: {
     "categoryCode": "betting",
     "providerId": 13,
     "currency": "NGN",
     "amount": "5000",
     "accountNumber": "12345",
     "pin": "1234"
   }
   → Payment completed
```

---

## Parameter Summary Table

| Parameter | Required For | Source | Description |
|-----------|--------------|--------|-------------|
| `categoryCode` | All | Endpoint 1 | Category code (airtime, data, etc.) |
| `providerId` | All | Endpoint 2 | Provider ID (MTN=1, GLO=2, etc.) |
| `currency` | All | User's wallet | Wallet currency (NGN, USD, etc.) |
| `amount` | Airtime, Electricity, Betting | User input | Payment amount |
| `planId` | Data, Cable TV | Endpoint 3 | Plan/bundle ID (amount comes from plan) |
| `accountNumber` | All | User input OR beneficiaryId | Phone/meter/account number |
| `accountType` | Electricity only | User selection | "prepaid" or "postpaid" |
| `beneficiaryId` | All (optional) | Endpoint 6 | Saved beneficiary ID (replaces accountNumber) |
| `pin` | Confirm only | User input | User PIN for authorization |

---

## Important Notes

1. **Initiate vs Confirm:**
   - `initiate` = Preview only, NO database record
   - `confirm` = Creates transaction, deducts balance

2. **Amount Handling:**
   - For Data/Cable TV: If `planId` is provided, `amount` is ignored (uses plan amount)
   - For others: `amount` is required

3. **Account Number:**
   - Can use `accountNumber` directly OR `beneficiaryId` (saved beneficiary)
   - If both provided, `beneficiaryId` takes precedence

4. **Validation:**
   - Electricity: Must validate meter before initiate
   - Betting: Must validate account before initiate
   - Others: No validation needed

5. **Plans:**
   - Only Data and Cable TV use plans
   - Airtime, Electricity, Betting: User enters custom amount


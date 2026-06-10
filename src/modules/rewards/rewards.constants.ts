export type RewardTierCode = 'bronze' | 'silver' | 'gold';

export interface RewardTierDefinition {
  code: RewardTierCode;
  name: string;
  order: number;
  requiredTransactions: number;
  requiredMonthlyBalanceUsd: number;
}

export interface RewardDefinition {
  code: string;
  tierCode: RewardTierCode;
  title: string;
  description: string;
  value: string;
  icon: 'gift' | 'cashback' | 'airtime' | 'data';
}

export const REWARD_TIERS: RewardTierDefinition[] = [
  {
    code: 'bronze',
    name: 'BRONZE',
    order: 0,
    requiredTransactions: 0,
    requiredMonthlyBalanceUsd: 0,
  },
  {
    code: 'silver',
    name: 'SILVER',
    order: 1,
    requiredTransactions: 10,
    requiredMonthlyBalanceUsd: 1000,
  },
  {
    code: 'gold',
    name: 'GOLD',
    order: 2,
    requiredTransactions: 50,
    requiredMonthlyBalanceUsd: 5000,
  },
];

export const REWARD_CATALOG: RewardDefinition[] = [
  {
    code: 'bronze_birthday_gift',
    tierCode: 'bronze',
    title: 'Birthday Gift',
    description: 'Get a special gift on your birthday',
    value: '1GB Data',
    icon: 'gift',
  },
  {
    code: 'bronze_bill_cashback',
    tierCode: 'bronze',
    title: 'Bill Payment Cashback',
    description: 'Earn cashback on your next bill payment',
    value: '5% Cashback',
    icon: 'cashback',
  },
  {
    code: 'bronze_welcome_airtime',
    tierCode: 'bronze',
    title: 'Welcome Airtime',
    description: 'Free airtime for active Rhinox Pay users',
    value: '₦200 Airtime',
    icon: 'airtime',
  },
  {
    code: 'silver_monthly_airtime',
    tierCode: 'silver',
    title: 'Monthly Airtime',
    description: 'Free monthly airtime for Silver members',
    value: '₦1,000 Airtime',
    icon: 'airtime',
  },
  {
    code: 'silver_data_bonus',
    tierCode: 'silver',
    title: 'Data Bonus',
    description: 'Extra data bundle every month',
    value: '2GB Data',
    icon: 'data',
  },
  {
    code: 'gold_priority_support',
    tierCode: 'gold',
    title: 'Priority Support',
    description: 'Skip the queue with priority support access',
    value: 'Priority Access',
    icon: 'gift',
  },
];

export const TIER_ORDER: Record<RewardTierCode, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
};

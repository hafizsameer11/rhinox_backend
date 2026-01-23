-- AlterTable: Replace buyerId with userId
-- This migration updates the P2P order schema to use a simpler design:
-- - vendorId: Ad owner (who created the ad)
-- - userId: User who created the order
-- Buyer/seller roles are derived from these fields based on ad type

-- Step 1: Add userId column (nullable first)
ALTER TABLE `p2p_orders` ADD COLUMN `user_id` INT NULL AFTER `vendor_id`;

-- Step 2: Populate userId from existing buyerId
-- For SELL ads: buyerId = userId (user is buyer)
-- For BUY ads: buyerId = vendorId, so we need to find the actual user
-- Since we can't determine the actual user from existing data for BUY ads,
-- we'll set userId = buyerId as a fallback (this may need manual correction)
UPDATE `p2p_orders` SET `user_id` = `buyer_id`;

-- Step 3: Make userId NOT NULL after population
ALTER TABLE `p2p_orders` MODIFY COLUMN `user_id` INT NOT NULL;

-- Step 4: Add foreign key constraint for userId
ALTER TABLE `p2p_orders` ADD CONSTRAINT `p2p_orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Add index for userId
CREATE INDEX `p2p_orders_user_id_idx` ON `p2p_orders`(`user_id`);

-- Step 6: Drop old index for buyerId (if exists)
DROP INDEX `p2p_orders_buyer_id_idx` ON `p2p_orders`;

-- Step 7: Drop foreign key constraint for buyerId (if exists)
ALTER TABLE `p2p_orders` DROP FOREIGN KEY `p2p_orders_buyer_id_fkey`;

-- Step 8: Drop buyerId column
ALTER TABLE `p2p_orders` DROP COLUMN `buyer_id`;

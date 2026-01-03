-- AlterTable
ALTER TABLE `p2p_ads` ADD COLUMN `processing_time` INTEGER NULL;

-- AlterTable
ALTER TABLE `p2p_orders` ADD COLUMN `accepted_at` DATETIME(3) NULL,
    ADD COLUMN `expires_at` DATETIME(3) NULL,
    ADD COLUMN `payment_channel` VARCHAR(191) NULL,
    ADD COLUMN `processing_time_minutes` INTEGER NULL;

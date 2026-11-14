-- Fee management foundation: fee config extensions, bill provider fees, profit ledger

ALTER TABLE `platform_fee_configs`
    ADD COLUMN `currency` VARCHAR(10) NULL,
    ADD COLUMN `provider_code` VARCHAR(50) NULL,
    ADD COLUMN `min_fee` DECIMAL(20, 8) NULL,
    ADD COLUMN `max_fee` DECIMAL(20, 8) NULL;

CREATE INDEX `platform_fee_configs_provider_code_idx` ON `platform_fee_configs`(`provider_code`);

ALTER TABLE `bill_payment_providers`
    ADD COLUMN `fee_type` VARCHAR(20) NULL DEFAULT 'percentage',
    ADD COLUMN `fee_value` DECIMAL(20, 8) NULL,
    ADD COLUMN `min_fee` DECIMAL(20, 8) NULL,
    ADD COLUMN `max_fee` DECIMAL(20, 8) NULL;

CREATE TABLE `platform_profit_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source` VARCHAR(40) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `transaction_id` INTEGER NULL,
    `busha_trade_log_id` INTEGER NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'NGN',
    `user_charged_amount` DECIMAL(20, 8) NOT NULL,
    `provider_cost_amount` DECIMAL(20, 8) NOT NULL,
    `markup_profit` DECIMAL(20, 8) NOT NULL,
    `markup_percent_applied` DECIMAL(10, 4) NULL,
    `crypto_code` VARCHAR(20) NULL,
    `provider_quote_id` VARCHAR(80) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_profit_entries_source_created_at_idx`(`source`, `created_at`),
    INDEX `platform_profit_entries_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `platform_profit_entries`
    ADD CONSTRAINT `platform_profit_entries_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

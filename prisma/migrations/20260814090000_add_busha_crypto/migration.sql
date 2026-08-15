-- Busha crypto custody tables. Tatum tables are unchanged.

CREATE TABLE `busha_config` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sell_payout_mode` VARCHAR(40) NOT NULL DEFAULT 'palmpay_temp',
    `payout_bank_code` VARCHAR(20) NULL,
    `payout_account_number` VARCHAR(50) NULL,
    `payout_account_name` VARCHAR(255) NULL,
    `payout_recipient_id` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `busha_config` (`id`, `is_active`, `sell_payout_mode`, `created_at`, `updated_at`)
VALUES (1, true, 'palmpay_temp', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

CREATE TABLE `busha_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `busha_profile_id` VARCHAR(80) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `first_name` VARCHAR(120) NULL,
    `last_name` VARCHAR(120) NULL,
    `phone` VARCHAR(40) NULL,
    `country_id` VARCHAR(4) NOT NULL DEFAULT 'NG',
    `birth_date` VARCHAR(20) NULL,
    `nin` VARCHAR(40) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'inactive',
    `provider_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `busha_customers_user_id_key`(`user_id`),
    UNIQUE INDEX `busha_customers_busha_profile_id_key`(`busha_profile_id`),
    INDEX `busha_customers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `busha_kyc_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `busha_customer_id` INTEGER NULL,
    `rhinox_kyc_id` INTEGER NULL,
    `source` VARCHAR(40) NOT NULL DEFAULT 'rhinox_kyc',
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `selfie_path` VARCHAR(500) NULL,
    `id_document_path` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `busha_kyc_applications_user_id_idx`(`user_id`),
    INDEX `busha_kyc_applications_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `busha_trade_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `busha_customer_id` INTEGER NULL,
    `side` VARCHAR(20) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'quoted',
    `source_currency` VARCHAR(20) NOT NULL,
    `target_currency` VARCHAR(20) NOT NULL,
    `source_amount` VARCHAR(40) NOT NULL,
    `target_amount` VARCHAR(40) NULL,
    `network` VARCHAR(20) NULL,
    `busha_quote_id` VARCHAR(80) NULL,
    `busha_transfer_id` VARCHAR(80) NULL,
    `busha_status` VARCHAR(40) NULL,
    `pay_in_bank_code` VARCHAR(20) NULL,
    `pay_in_bank_name` VARCHAR(120) NULL,
    `pay_in_account_number` VARCHAR(50) NULL,
    `pay_in_account_name` VARCHAR(255) NULL,
    `pay_in_expires_at` DATETIME(3) NULL,
    `crypto_deposit_address` VARCHAR(255) NULL,
    `crypto_deposit_network` VARCHAR(40) NULL,
    `destination_address` VARCHAR(255) NULL,
    `palmpay_order_id` VARCHAR(64) NULL,
    `palmpay_order_no` VARCHAR(64) NULL,
    `palmpay_status` VARCHAR(30) NULL,
    `payout_mode` VARCHAR(40) NULL,
    `fiat_transaction_id` INTEGER NULL,
    `provider_response` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `busha_trade_logs_busha_transfer_id_key`(`busha_transfer_id`),
    INDEX `busha_trade_logs_user_id_idx`(`user_id`),
    INDEX `busha_trade_logs_status_idx`(`status`),
    INDEX `busha_trade_logs_side_idx`(`side`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `busha_customers`
    ADD CONSTRAINT `busha_customers_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `busha_kyc_applications`
    ADD CONSTRAINT `busha_kyc_applications_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `busha_kyc_applications`
    ADD CONSTRAINT `busha_kyc_applications_busha_customer_id_fkey`
    FOREIGN KEY (`busha_customer_id`) REFERENCES `busha_customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `busha_trade_logs`
    ADD CONSTRAINT `busha_trade_logs_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `busha_trade_logs`
    ADD CONSTRAINT `busha_trade_logs_busha_customer_id_fkey`
    FOREIGN KEY (`busha_customer_id`) REFERENCES `busha_customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

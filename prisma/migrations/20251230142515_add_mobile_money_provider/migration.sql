-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `bank_account_id` VARCHAR(191) NULL,
    ADD COLUMN `channel` VARCHAR(191) NULL,
    ADD COLUMN `completed_at` DATETIME(3) NULL,
    ADD COLUMN `country` VARCHAR(191) NULL,
    ADD COLUMN `payment_method` VARCHAR(191) NULL,
    ADD COLUMN `provider_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `bank_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `country_code` VARCHAR(10) NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
    `bank_name` VARCHAR(255) NOT NULL,
    `account_number` VARCHAR(50) NOT NULL,
    `account_name` VARCHAR(255) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `bank_accounts_country_code_idx`(`country_code`),
    INDEX `bank_accounts_currency_idx`(`currency`),
    INDEX `bank_accounts_is_active_idx`(`is_active`),
    UNIQUE INDEX `bank_accounts_country_code_currency_key`(`country_code`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mobile_money_providers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `country_code` VARCHAR(10) NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
    `logo_url` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mobile_money_providers_country_code_idx`(`country_code`),
    INDEX `mobile_money_providers_currency_idx`(`currency`),
    INDEX `mobile_money_providers_is_active_idx`(`is_active`),
    INDEX `mobile_money_providers_code_idx`(`code`),
    UNIQUE INDEX `mobile_money_providers_code_country_code_currency_key`(`code`, `country_code`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_rates` (
    `id` VARCHAR(191) NOT NULL,
    `from_currency` VARCHAR(10) NOT NULL,
    `to_currency` VARCHAR(10) NOT NULL,
    `rate` DECIMAL(20, 8) NOT NULL,
    `inverse_rate` DECIMAL(20, 8) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exchange_rates_from_currency_idx`(`from_currency`),
    INDEX `exchange_rates_to_currency_idx`(`to_currency`),
    INDEX `exchange_rates_is_active_idx`(`is_active`),
    UNIQUE INDEX `exchange_rates_from_currency_to_currency_key`(`from_currency`, `to_currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_currencies` (
    `id` VARCHAR(191) NOT NULL,
    `blockchain` VARCHAR(255) NOT NULL,
    `currency` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(255) NULL,
    `name` VARCHAR(255) NOT NULL,
    `price` DECIMAL(20, 8) NULL,
    `naira_price` DECIMAL(20, 8) NULL,
    `token_type` VARCHAR(50) NULL,
    `contract_address` VARCHAR(255) NULL,
    `decimals` INTEGER NOT NULL DEFAULT 18,
    `is_token` BOOLEAN NOT NULL DEFAULT false,
    `blockchain_name` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `wallet_currencies_blockchain_idx`(`blockchain`),
    INDEX `wallet_currencies_currency_idx`(`currency`),
    INDEX `wallet_currencies_is_token_idx`(`is_token`),
    UNIQUE INDEX `wallet_currencies_blockchain_currency_key`(`blockchain`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_wallets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `blockchain` VARCHAR(255) NOT NULL,
    `mnemonic` TEXT NULL,
    `xpub` VARCHAR(500) NULL,
    `derivation_path` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_wallets_user_id_idx`(`user_id`),
    INDEX `user_wallets_blockchain_idx`(`blockchain`),
    UNIQUE INDEX `user_wallets_user_id_blockchain_key`(`user_id`, `blockchain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `virtual_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `blockchain` VARCHAR(255) NOT NULL,
    `currency` VARCHAR(50) NOT NULL,
    `customer_id` VARCHAR(255) NULL,
    `account_id` VARCHAR(255) NOT NULL,
    `account_code` VARCHAR(255) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `frozen` BOOLEAN NOT NULL DEFAULT false,
    `account_balance` VARCHAR(255) NOT NULL DEFAULT '0',
    `available_balance` VARCHAR(255) NOT NULL DEFAULT '0',
    `xpub` VARCHAR(500) NULL,
    `accounting_currency` VARCHAR(50) NULL,
    `currency_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `virtual_accounts_account_id_key`(`account_id`),
    INDEX `virtual_accounts_user_id_idx`(`user_id`),
    INDEX `virtual_accounts_blockchain_idx`(`blockchain`),
    INDEX `virtual_accounts_currency_idx`(`currency`),
    INDEX `virtual_accounts_currency_id_idx`(`currency_id`),
    INDEX `virtual_accounts_account_id_idx`(`account_id`),
    UNIQUE INDEX `virtual_accounts_user_id_blockchain_currency_key`(`user_id`, `blockchain`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deposit_addresses` (
    `id` VARCHAR(191) NOT NULL,
    `virtual_account_id` VARCHAR(191) NOT NULL,
    `user_wallet_id` VARCHAR(191) NULL,
    `blockchain` VARCHAR(255) NULL,
    `currency` VARCHAR(50) NULL,
    `address` VARCHAR(255) NOT NULL,
    `index` INTEGER NULL,
    `private_key` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `deposit_addresses_virtual_account_id_idx`(`virtual_account_id`),
    INDEX `deposit_addresses_user_wallet_id_idx`(`user_wallet_id`),
    INDEX `deposit_addresses_blockchain_idx`(`blockchain`),
    INDEX `deposit_addresses_address_idx`(`address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `master_wallets` (
    `id` VARCHAR(191) NOT NULL,
    `blockchain` VARCHAR(255) NOT NULL,
    `xpub` VARCHAR(500) NULL,
    `address` VARCHAR(255) NULL,
    `privateKey` TEXT NULL,
    `mnemonic` TEXT NULL,
    `response` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `master_wallets_blockchain_key`(`blockchain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_responses` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(255) NULL,
    `subscription_type` VARCHAR(255) NULL,
    `amount` DECIMAL(20, 8) NULL,
    `reference` VARCHAR(255) NULL,
    `currency` VARCHAR(50) NULL,
    `tx_id` VARCHAR(255) NULL,
    `block_height` BIGINT NULL,
    `block_hash` VARCHAR(255) NULL,
    `from_address` VARCHAR(255) NULL,
    `to_address` VARCHAR(255) NULL,
    `contract_address` VARCHAR(255) NULL,
    `transaction_date` DATETIME(3) NULL,
    `index` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `webhook_responses_account_id_idx`(`account_id`),
    INDEX `webhook_responses_reference_idx`(`reference`),
    INDEX `webhook_responses_tx_id_idx`(`tx_id`),
    INDEX `webhook_responses_to_address_idx`(`to_address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tatum_raw_webhooks` (
    `id` VARCHAR(191) NOT NULL,
    `raw_data` LONGTEXT NOT NULL,
    `headers` TEXT NULL,
    `ip_address` VARCHAR(255) NULL,
    `user_agent` VARCHAR(500) NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `processed_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tatum_raw_webhooks_processed_idx`(`processed`),
    INDEX `tatum_raw_webhooks_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `transactions_channel_idx` ON `transactions`(`channel`);

-- CreateIndex
CREATE INDEX `transactions_provider_id_idx` ON `transactions`(`provider_id`);

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_bank_account_id_fkey` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `mobile_money_providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_wallets` ADD CONSTRAINT `user_wallets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `virtual_accounts` ADD CONSTRAINT `virtual_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `virtual_accounts` ADD CONSTRAINT `virtual_accounts_currency_id_fkey` FOREIGN KEY (`currency_id`) REFERENCES `wallet_currencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deposit_addresses` ADD CONSTRAINT `deposit_addresses_virtual_account_id_fkey` FOREIGN KEY (`virtual_account_id`) REFERENCES `virtual_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deposit_addresses` ADD CONSTRAINT `deposit_addresses_user_wallet_id_fkey` FOREIGN KEY (`user_wallet_id`) REFERENCES `user_wallets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

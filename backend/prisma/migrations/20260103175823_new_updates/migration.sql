-- CreateTable
CREATE TABLE `user_payment_methods` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `account_type` VARCHAR(191) NULL,
    `bank_name` VARCHAR(191) NULL,
    `account_number` VARCHAR(191) NULL,
    `account_name` VARCHAR(191) NULL,
    `provider_id` VARCHAR(191) NULL,
    `phone_number` VARCHAR(191) NULL,
    `country_code` VARCHAR(10) NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_payment_methods_user_id_idx`(`user_id`),
    INDEX `user_payment_methods_type_idx`(`type`),
    INDEX `user_payment_methods_country_code_idx`(`country_code`),
    INDEX `user_payment_methods_currency_idx`(`currency`),
    INDEX `user_payment_methods_is_default_idx`(`is_default`),
    INDEX `user_payment_methods_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `p2p_ads` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `crypto_currency` VARCHAR(50) NOT NULL,
    `fiat_currency` VARCHAR(10) NOT NULL,
    `price` DECIMAL(20, 8) NOT NULL,
    `volume` DECIMAL(20, 8) NOT NULL,
    `min_order` DECIMAL(20, 8) NOT NULL,
    `max_order` DECIMAL(20, 8) NOT NULL,
    `auto_accept` BOOLEAN NOT NULL DEFAULT false,
    `payment_method_ids` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'available',
    `is_online` BOOLEAN NOT NULL DEFAULT true,
    `orders_received` INTEGER NOT NULL DEFAULT 0,
    `response_time` INTEGER NULL,
    `score` DECIMAL(5, 2) NULL,
    `country_code` VARCHAR(10) NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `p2p_ads_user_id_idx`(`user_id`),
    INDEX `p2p_ads_type_idx`(`type`),
    INDEX `p2p_ads_crypto_currency_idx`(`crypto_currency`),
    INDEX `p2p_ads_fiat_currency_idx`(`fiat_currency`),
    INDEX `p2p_ads_status_idx`(`status`),
    INDEX `p2p_ads_is_online_idx`(`is_online`),
    INDEX `p2p_ads_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_payment_methods` ADD CONSTRAINT `user_payment_methods_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_payment_methods` ADD CONSTRAINT `user_payment_methods_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `mobile_money_providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_ads` ADD CONSTRAINT `p2p_ads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

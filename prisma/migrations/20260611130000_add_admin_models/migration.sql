-- Drop old support chat assignee FK to users (if exists)
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'support_chats'
    AND CONSTRAINT_NAME = 'support_chats_assigned_to_fkey'
);
SET @sql := IF(@fk_exists > 0, 'ALTER TABLE `support_chats` DROP FOREIGN KEY `support_chats_assigned_to_fkey`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Clear invalid assignee references before new FK
UPDATE `support_chats` SET `assigned_to` = NULL WHERE `assigned_to` IS NOT NULL;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(191) NULL,
    `last_name` VARCHAR(191) NULL,
    `role` VARCHAR(40) NOT NULL DEFAULT 'ADMIN',
    `country` VARCHAR(10) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_users_email_key`(`email`),
    INDEX `admin_users_email_idx`(`email`),
    INDEX `admin_users_role_idx`(`role`),
    INDEX `admin_users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `refresh_token` VARCHAR(500) NULL,
    `ip_address` VARCHAR(191) NULL,
    `user_agent` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_sessions_token_key`(`token`),
    UNIQUE INDEX `admin_sessions_refresh_token_key`(`refresh_token`),
    INDEX `admin_sessions_admin_id_idx`(`admin_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_otps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NOT NULL,
    `code` VARCHAR(10) NOT NULL,
    `type` VARCHAR(40) NOT NULL DEFAULT 'admin_login',
    `expires_at` DATETIME(3) NOT NULL,
    `is_used` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_otps_admin_id_idx`(`admin_id`),
    INDEX `admin_otps_code_idx`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NOT NULL,
    `action` VARCHAR(120) NOT NULL,
    `resource` VARCHAR(80) NOT NULL,
    `resource_id` VARCHAR(80) NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_audit_logs_admin_id_idx`(`admin_id`),
    INDEX `admin_audit_logs_resource_idx`(`resource`),
    INDEX `admin_audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_fee_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wallet_type` VARCHAR(20) NOT NULL,
    `service_type` VARCHAR(80) NOT NULL,
    `sub_type` VARCHAR(80) NULL,
    `fee_type` VARCHAR(20) NOT NULL DEFAULT 'percentage',
    `value` DECIMAL(10, 4) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `platform_fee_configs_wallet_type_service_type_idx`(`wallet_type`, `service_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `reward_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `service` VARCHAR(80) NOT NULL,
    `metric` VARCHAR(40) NOT NULL,
    `period` VARCHAR(40) NOT NULL,
    `threshold` DECIMAL(20, 8) NOT NULL,
    `reward_type` VARCHAR(40) NOT NULL,
    `reward_value` VARCHAR(255) NOT NULL,
    `reward_meta` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `reward_rules_service_idx`(`service`),
    INDEX `reward_rules_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_rewards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `rule_id` INTEGER NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'eligible',
    `eligible_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimed_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `claim_meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_rewards_user_id_idx`(`user_id`),
    INDEX `user_rewards_rule_id_idx`(`rule_id`),
    INDEX `user_rewards_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NULL,
    `title` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `countries` JSON NULL,
    `user_segment` VARCHAR(80) NULL,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_notifications_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_banners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `image_url` VARCHAR(500) NOT NULL,
    `regions` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `admin_banners_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `admin_sessions` ADD CONSTRAINT `admin_sessions_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `admin_otps` ADD CONSTRAINT `admin_otps_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `admin_audit_logs` ADD CONSTRAINT `admin_audit_logs_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `admin_notifications` ADD CONSTRAINT `admin_notifications_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `user_rewards` ADD CONSTRAINT `user_rewards_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `user_rewards` ADD CONSTRAINT `user_rewards_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `reward_rules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `support_chats` ADD CONSTRAINT `support_chats_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `support_messages` ADD COLUMN `is_from_support` BOOLEAN NOT NULL DEFAULT false;

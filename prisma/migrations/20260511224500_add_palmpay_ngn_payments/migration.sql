-- Add PalmPay bank code support for verified payout accounts
ALTER TABLE `user_payment_methods`
  ADD COLUMN `bank_code` VARCHAR(50) NULL;

CREATE INDEX `user_payment_methods_bank_code_idx` ON `user_payment_methods`(`bank_code`);

-- Store PalmPay virtual account orders created for NGN deposits
CREATE TABLE `palmpay_virtual_accounts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `transaction_id` INTEGER NOT NULL,
  `merchant_order_id` VARCHAR(100) NOT NULL,
  `palmpay_order_no` VARCHAR(100) NULL,
  `payer_account_type` VARCHAR(50) NULL,
  `payer_account_id` VARCHAR(100) NULL,
  `payer_bank_name` VARCHAR(255) NULL,
  `payer_account_name` VARCHAR(255) NULL,
  `payer_virtual_acc_no` VARCHAR(50) NULL,
  `order_status` INTEGER NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `palmpay_virtual_accounts_merchant_order_id_key`(`merchant_order_id`),
  INDEX `palmpay_virtual_accounts_transaction_id_idx`(`transaction_id`),
  INDEX `palmpay_virtual_accounts_merchant_order_id_idx`(`merchant_order_id`),
  INDEX `palmpay_virtual_accounts_palmpay_order_no_idx`(`palmpay_order_no`),
  INDEX `palmpay_virtual_accounts_order_status_idx`(`order_status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `palmpay_virtual_accounts`
  ADD CONSTRAINT `palmpay_virtual_accounts_transaction_id_fkey`
  FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit PalmPay webhook payloads before processing
CREATE TABLE `palmpay_raw_webhooks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `raw_data` JSON NOT NULL,
  `headers` JSON NULL,
  `ip_address` VARCHAR(100) NULL,
  `user_agent` VARCHAR(255) NULL,
  `processed` BOOLEAN NOT NULL DEFAULT false,
  `processed_at` DATETIME(3) NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `palmpay_raw_webhooks_processed_idx`(`processed`),
  INDEX `palmpay_raw_webhooks_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

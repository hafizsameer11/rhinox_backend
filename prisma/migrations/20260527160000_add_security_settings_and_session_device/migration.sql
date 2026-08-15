-- AlterTable
ALTER TABLE `users`
    ADD COLUMN `verify_transactions_with_pin` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `verify_transactions_with_email` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `verify_transactions_with_2fa` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `sessions`
    ADD COLUMN `device_name` VARCHAR(191) NULL;

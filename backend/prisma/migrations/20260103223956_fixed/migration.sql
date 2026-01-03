/*
  Warnings:

  - The primary key for the `bank_accounts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `bank_accounts` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `mobile_money_providers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `mobile_money_providers` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `bank_account_id` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `provider_id` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `provider_id` on the `user_payment_methods` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.

*/
-- DropForeignKey
ALTER TABLE `transactions` DROP FOREIGN KEY `transactions_bank_account_id_fkey`;

-- DropForeignKey
ALTER TABLE `transactions` DROP FOREIGN KEY `transactions_provider_id_fkey`;

-- DropForeignKey
ALTER TABLE `user_payment_methods` DROP FOREIGN KEY `user_payment_methods_provider_id_fkey`;

-- DropIndex
DROP INDEX `transactions_bank_account_id_fkey` ON `transactions`;

-- DropIndex
DROP INDEX `user_payment_methods_provider_id_fkey` ON `user_payment_methods`;

-- AlterTable
ALTER TABLE `bank_accounts` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `mobile_money_providers` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `transactions` MODIFY `bank_account_id` INTEGER NULL,
    MODIFY `provider_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `user_payment_methods` MODIFY `provider_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_bank_account_id_fkey` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `mobile_money_providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_payment_methods` ADD CONSTRAINT `user_payment_methods_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `mobile_money_providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

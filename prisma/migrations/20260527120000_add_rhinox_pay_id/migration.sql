-- AlterTable
ALTER TABLE `users` ADD COLUMN `rhinox_pay_id` VARCHAR(20) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_rhinox_pay_id_key` ON `users`(`rhinox_pay_id`);

-- CreateIndex
CREATE INDEX `users_rhinox_pay_id_idx` ON `users`(`rhinox_pay_id`);

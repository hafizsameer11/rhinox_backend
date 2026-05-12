-- CreateTable
CREATE TABLE `application_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `level` VARCHAR(20) NOT NULL DEFAULT 'error',
    `source` VARCHAR(120) NOT NULL,
    `message` TEXT NULL,
    `user_id` INTEGER NULL,
    `request_id` VARCHAR(100) NULL,
    `status_code` INTEGER NULL,
    `error_name` VARCHAR(120) NULL,
    `stack_trace` LONGTEXT NULL,
    `context` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `application_logs_level_idx`(`level`),
    INDEX `application_logs_source_idx`(`source`),
    INDEX `application_logs_user_id_idx`(`user_id`),
    INDEX `application_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `application_logs` ADD CONSTRAINT `application_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `reward_claims` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `reward_code` VARCHAR(80) NOT NULL,
  `reward_title` VARCHAR(255) NOT NULL,
  `tier_code` VARCHAR(40) NOT NULL,
  `value` VARCHAR(120) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'completed',
  `claimed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `reward_claims_user_id_reward_code_key`(`user_id`, `reward_code`),
  INDEX `reward_claims_user_id_idx`(`user_id`),
  INDEX `reward_claims_claimed_at_idx`(`claimed_at`),
  CONSTRAINT `reward_claims_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

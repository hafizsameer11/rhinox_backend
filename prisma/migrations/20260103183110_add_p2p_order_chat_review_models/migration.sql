-- CreateTable
CREATE TABLE `p2p_orders` (
    `id` VARCHAR(191) NOT NULL,
    `ad_id` VARCHAR(191) NOT NULL,
    `buyer_id` VARCHAR(191) NOT NULL,
    `vendor_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `crypto_currency` VARCHAR(50) NOT NULL,
    `fiat_currency` VARCHAR(10) NOT NULL,
    `crypto_amount` DECIMAL(20, 8) NOT NULL,
    `fiat_amount` DECIMAL(20, 8) NOT NULL,
    `price` DECIMAL(20, 8) NOT NULL,
    `payment_method_id` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `payment_confirmed_at` DATETIME(3) NULL,
    `payment_received_at` DATETIME(3) NULL,
    `coin_released_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `tx_id` VARCHAR(255) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `p2p_orders_ad_id_idx`(`ad_id`),
    INDEX `p2p_orders_buyer_id_idx`(`buyer_id`),
    INDEX `p2p_orders_vendor_id_idx`(`vendor_id`),
    INDEX `p2p_orders_status_idx`(`status`),
    INDEX `p2p_orders_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `p2p_chat_messages` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `sender_id` VARCHAR(191) NOT NULL,
    `receiver_id` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `p2p_chat_messages_order_id_idx`(`order_id`),
    INDEX `p2p_chat_messages_sender_id_idx`(`sender_id`),
    INDEX `p2p_chat_messages_receiver_id_idx`(`receiver_id`),
    INDEX `p2p_chat_messages_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `p2p_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `reviewer_id` VARCHAR(191) NOT NULL,
    `reviewee_id` VARCHAR(191) NOT NULL,
    `ad_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `comment` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `p2p_reviews_order_id_idx`(`order_id`),
    INDEX `p2p_reviews_reviewee_id_idx`(`reviewee_id`),
    INDEX `p2p_reviews_ad_id_idx`(`ad_id`),
    INDEX `p2p_reviews_created_at_idx`(`created_at`),
    UNIQUE INDEX `p2p_reviews_order_id_key`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `p2p_orders` ADD CONSTRAINT `p2p_orders_ad_id_fkey` FOREIGN KEY (`ad_id`) REFERENCES `p2p_ads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_orders` ADD CONSTRAINT `p2p_orders_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_orders` ADD CONSTRAINT `p2p_orders_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_orders` ADD CONSTRAINT `p2p_orders_payment_method_id_fkey` FOREIGN KEY (`payment_method_id`) REFERENCES `user_payment_methods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_chat_messages` ADD CONSTRAINT `p2p_chat_messages_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `p2p_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_chat_messages` ADD CONSTRAINT `p2p_chat_messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_chat_messages` ADD CONSTRAINT `p2p_chat_messages_receiver_id_fkey` FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_reviews` ADD CONSTRAINT `p2p_reviews_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `p2p_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_reviews` ADD CONSTRAINT `p2p_reviews_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_reviews` ADD CONSTRAINT `p2p_reviews_reviewee_id_fkey` FOREIGN KEY (`reviewee_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `p2p_reviews` ADD CONSTRAINT `p2p_reviews_ad_id_fkey` FOREIGN KEY (`ad_id`) REFERENCES `p2p_ads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

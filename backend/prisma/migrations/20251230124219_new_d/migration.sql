/*
  Warnings:

  - You are about to drop the column `documentType` on the `kyc_verifications` table. All the data in the column will be lost.
  - You are about to drop the column `documentUrl` on the `kyc_verifications` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `countries` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `kyc_verifications` DROP COLUMN `documentType`,
    DROP COLUMN `documentUrl`,
    ADD COLUMN `dateOfBirth` DATETIME(3) NULL,
    ADD COLUMN `faceVerificationImageUrl` VARCHAR(191) NULL,
    ADD COLUMN `faceVerificationSuccessful` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `firstName` VARCHAR(191) NULL,
    ADD COLUMN `idDocumentUrl` VARCHAR(191) NULL,
    ADD COLUMN `idNumber` VARCHAR(191) NULL,
    ADD COLUMN `idType` VARCHAR(191) NULL,
    ADD COLUMN `lastName` VARCHAR(191) NULL,
    ADD COLUMN `middleName` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `countryId` VARCHAR(191) NULL,
    ADD COLUMN `middleName` VARCHAR(191) NULL,
    ADD COLUMN `pinHash` VARCHAR(191) NULL,
    ADD COLUMN `termsAccepted` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `wallets` ADD COLUMN `currencyId` VARCHAR(191) NULL,
    ADD COLUMN `currencyName` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `otps` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `isUsed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `otps_userId_idx`(`userId`),
    INDEX `otps_code_idx`(`code`),
    INDEX `otps_type_idx`(`type`),
    INDEX `otps_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `currencies` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `symbol` VARCHAR(191) NULL,
    `countryId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'fiat',
    `flag` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(20, 8) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `currencies_code_key`(`code`),
    INDEX `currencies_code_idx`(`code`),
    INDEX `currencies_countryId_idx`(`countryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `countries_code_key` ON `countries`(`code`);

-- CreateIndex
CREATE INDEX `countries_code_idx` ON `countries`(`code`);

-- CreateIndex
CREATE INDEX `kyc_verifications_tier_idx` ON `kyc_verifications`(`tier`);

-- CreateIndex
CREATE INDEX `users_countryId_idx` ON `users`(`countryId`);

-- CreateIndex
CREATE INDEX `wallets_currencyId_idx` ON `wallets`(`currencyId`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_countryId_fkey` FOREIGN KEY (`countryId`) REFERENCES `countries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `otps` ADD CONSTRAINT `otps_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_currencyId_fkey` FOREIGN KEY (`currencyId`) REFERENCES `currencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `currencies` ADD CONSTRAINT `currencies_countryId_fkey` FOREIGN KEY (`countryId`) REFERENCES `countries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

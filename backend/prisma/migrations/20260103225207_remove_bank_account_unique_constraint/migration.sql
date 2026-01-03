-- DropIndex
DROP INDEX `bank_accounts_country_code_currency_key` ON `bank_accounts`;

-- CreateIndex
CREATE INDEX `bank_accounts_country_code_currency_idx` ON `bank_accounts`(`country_code`, `currency`);

-- Manager flag on users
ALTER TABLE `users` ADD COLUMN `is_manager` TINYINT(1) NOT NULL DEFAULT 0 AFTER `location`;

-- Description for checklist items
ALTER TABLE `onboarding_config` ADD COLUMN `description` TEXT DEFAULT NULL AFTER `label`;

-- Description carried into per-request checklist
ALTER TABLE `onboarding_checklist` ADD COLUMN `description` TEXT DEFAULT NULL AFTER `label`;

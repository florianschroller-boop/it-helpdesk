-- Add location field to users
ALTER TABLE `users` ADD COLUMN `location` VARCHAR(100) DEFAULT NULL AFTER `department`;
CREATE INDEX `idx_users_location` ON `users` (`location`);

-- Multi-Role Support
-- role field changes from ENUM to VARCHAR with JSON-compatible comma-separated values
-- New roles: disposition, assistenz
-- Roles are combinable: e.g. "agent,disposition" or "user,assistenz"

ALTER TABLE `users` MODIFY COLUMN `role` VARCHAR(200) NOT NULL DEFAULT 'user';

-- Locations / Standorte
CREATE TABLE IF NOT EXISTS `locations` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `address` VARCHAR(500) DEFAULT NULL,
  `directions` TEXT COMMENT 'Anfahrtsbeschreibung',
  `contact_name` VARCHAR(100) DEFAULT NULL,
  `contact_phone` VARCHAR(50) DEFAULT NULL,
  `contact_email` VARCHAR(255) DEFAULT NULL,
  `notes` TEXT COMMENT 'Besonderheiten',
  `floor_plan_url` VARCHAR(500) DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT UNSIGNED DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_locations_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

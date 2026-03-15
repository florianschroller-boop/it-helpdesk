-- ============================================
-- Inventory System Upgrade
-- ============================================

-- Suppliers / Lieferanten
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `contact_name` VARCHAR(100) DEFAULT NULL,
  `contact_email` VARCHAR(255) DEFAULT NULL,
  `contact_phone` VARCHAR(50) DEFAULT NULL,
  `website` VARCHAR(500) DEFAULT NULL,
  `address` VARCHAR(500) DEFAULT NULL,
  `customer_number` VARCHAR(100) DEFAULT NULL COMMENT 'Kundennummer beim Lieferanten',
  `notes` TEXT,
  `quote_email_template` TEXT COMMENT 'Vorlage fuer Angebotsanfrage',
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend assets with supplier/order fields
ALTER TABLE `assets` ADD COLUMN `supplier_id` INT UNSIGNED DEFAULT NULL AFTER `notes`;
ALTER TABLE `assets` ADD COLUMN `order_number` VARCHAR(100) DEFAULT NULL AFTER `supplier_id`;
ALTER TABLE `assets` ADD COLUMN `tracking_number` VARCHAR(200) DEFAULT NULL AFTER `order_number`;
ALTER TABLE `assets` ADD COLUMN `invoice_number` VARCHAR(100) DEFAULT NULL AFTER `tracking_number`;
ALTER TABLE `assets` ADD COLUMN `price` DECIMAL(10,2) DEFAULT NULL AFTER `invoice_number`;
ALTER TABLE `assets` ADD COLUMN `custom_fields_json` JSON DEFAULT NULL AFTER `price`;
ALTER TABLE `assets` ADD FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL;

-- Accessories / Zubehoer & Verbrauchsmaterial (Lager)
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `category` ENUM('accessory','consumable','cable','adapter','spare','other') NOT NULL DEFAULT 'accessory',
  `sku` VARCHAR(50) DEFAULT NULL COMMENT 'Artikelnummer',
  `location` VARCHAR(100) DEFAULT NULL,
  `quantity` INT NOT NULL DEFAULT 0,
  `min_quantity` INT NOT NULL DEFAULT 0 COMMENT 'Mindestbestand — Warnung wenn unterschritten',
  `unit` VARCHAR(30) DEFAULT 'Stk.' COMMENT 'Stueck, Packung, Meter, etc.',
  `supplier_id` INT UNSIGNED DEFAULT NULL,
  `price` DECIMAL(10,2) DEFAULT NULL,
  `notes` TEXT,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_inv_category` (`category`),
  INDEX `idx_inv_quantity` (`quantity`, `min_quantity`),
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventory movements (stock in/out log)
CREATE TABLE IF NOT EXISTS `inventory_movements` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `item_id` INT UNSIGNED NOT NULL,
  `type` ENUM('in','out','correction') NOT NULL,
  `quantity` INT NOT NULL,
  `reason` VARCHAR(255) DEFAULT NULL,
  `performed_by` INT UNSIGNED DEFAULT NULL,
  `performed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Custom field definitions for assets
CREATE TABLE IF NOT EXISTS `asset_custom_fields` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `field_name` VARCHAR(100) NOT NULL,
  `field_type` VARCHAR(30) NOT NULL DEFAULT 'text' COMMENT 'text, textarea, number, date, select',
  `options_json` JSON DEFAULT NULL COMMENT 'Optionen fuer select-Felder',
  `sort_order` INT UNSIGNED DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quote request log
CREATE TABLE IF NOT EXISTS `quote_requests` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `supplier_id` INT UNSIGNED NOT NULL,
  `asset_id` INT UNSIGNED DEFAULT NULL,
  `subject` VARCHAR(300) NOT NULL,
  `body` TEXT NOT NULL,
  `sent_to` VARCHAR(255) NOT NULL,
  `sent_by` INT UNSIGNED NOT NULL,
  `ticket_id` INT UNSIGNED DEFAULT NULL,
  `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`sent_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

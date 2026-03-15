-- Response Templates / Antwortvorlagen
CREATE TABLE IF NOT EXISTS `response_templates` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `category` VARCHAR(100) DEFAULT NULL COMMENT 'Ticket-Kategorie für Auto-Vorschlag (NULL = alle)',
  `tags` VARCHAR(500) DEFAULT NULL COMMENT 'Kommagetrennte Schlüsselwörter für Matching',
  `sort_order` INT UNSIGNED DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_templates_category` (`category`),
  INDEX `idx_templates_active` (`active`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

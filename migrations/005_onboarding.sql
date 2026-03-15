-- Onboarding Configuration: form fields and checklist templates
CREATE TABLE IF NOT EXISTS `onboarding_config` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `config_type` ENUM('form_field','checklist_item','hardware_option') NOT NULL,
  `label` VARCHAR(200) NOT NULL,
  `field_type` VARCHAR(50) DEFAULT NULL COMMENT 'text, textarea, select, checkbox, date — for form_field',
  `options_json` JSON DEFAULT NULL COMMENT 'select options or defaults',
  `required` TINYINT(1) DEFAULT 0,
  `sort_order` INT UNSIGNED DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Onboarding Requests
CREATE TABLE IF NOT EXISTS `onboarding_requests` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `request_number` VARCHAR(20) NOT NULL UNIQUE,
  `ticket_id` INT UNSIGNED DEFAULT NULL,
  `status` ENUM('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  -- New employee data
  `employee_name` VARCHAR(100) NOT NULL,
  `employee_email` VARCHAR(255) DEFAULT NULL,
  `employee_position` VARCHAR(100) DEFAULT NULL,
  `employee_department` VARCHAR(100) DEFAULT NULL,
  `employee_location` VARCHAR(100) DEFAULT NULL,
  `start_date` DATE NOT NULL,
  `manager_notes` TEXT,
  -- Form field answers stored as JSON
  `form_data_json` JSON DEFAULT NULL,
  -- Hardware requests stored as JSON
  `hardware_json` JSON DEFAULT NULL,
  -- Meta
  `requested_by` INT UNSIGNED NOT NULL,
  `assigned_to` INT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_onboarding_status` (`status`),
  INDEX `idx_onboarding_ticket` (`ticket_id`),
  FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Onboarding Checklist (per request)
CREATE TABLE IF NOT EXISTS `onboarding_checklist` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `request_id` INT UNSIGNED NOT NULL,
  `label` VARCHAR(200) NOT NULL,
  `sort_order` INT UNSIGNED DEFAULT 0,
  `completed` TINYINT(1) NOT NULL DEFAULT 0,
  `completed_by` INT UNSIGNED DEFAULT NULL,
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  `notes` VARCHAR(500) DEFAULT NULL,
  INDEX `idx_checklist_request` (`request_id`),
  FOREIGN KEY (`request_id`) REFERENCES `onboarding_requests`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

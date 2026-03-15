-- IT Helpdesk & Asset Management System
-- Full Database Schema Migration
-- ============================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- Users & Roles
-- ============================================

CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL UNIQUE,
  `permissions_json` JSON,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin','agent','user') NOT NULL DEFAULT 'user',
  `department` VARCHAR(100) DEFAULT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `avatar_url` VARCHAR(500) DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `password_reset_token` VARCHAR(255) DEFAULT NULL,
  `password_reset_expires` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Tickets
-- ============================================

CREATE TABLE IF NOT EXISTS `tickets` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ticket_number` VARCHAR(20) NOT NULL UNIQUE,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `status` ENUM('open','pending','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  `priority` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `category` VARCHAR(100) DEFAULT 'Sonstiges',
  `requester_id` INT UNSIGNED NOT NULL,
  `assignee_id` INT UNSIGNED DEFAULT NULL,
  `asset_id` INT UNSIGNED DEFAULT NULL,
  `source` ENUM('email','web','phone') NOT NULL DEFAULT 'web',
  `sla_due_at` TIMESTAMP NULL DEFAULT NULL,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_tickets_status` (`status`),
  INDEX `idx_tickets_priority` (`priority`),
  INDEX `idx_tickets_requester` (`requester_id`),
  INDEX `idx_tickets_assignee` (`assignee_id`),
  INDEX `idx_tickets_category` (`category`),
  INDEX `idx_tickets_created` (`created_at`),
  INDEX `idx_tickets_number` (`ticket_number`),
  FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_comments` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `content` TEXT NOT NULL,
  `is_internal` TINYINT(1) NOT NULL DEFAULT 0,
  `attachments_json` JSON,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_comments_ticket` (`ticket_id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_attachments` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` INT UNSIGNED NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `filepath` VARCHAR(500) NOT NULL,
  `filesize` INT UNSIGNED DEFAULT 0,
  `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_history` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` INT UNSIGNED NOT NULL,
  `changed_by` INT UNSIGNED NOT NULL,
  `field_changed` VARCHAR(50) NOT NULL,
  `old_value` TEXT,
  `new_value` TEXT,
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_history_ticket` (`ticket_id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Assets
-- ============================================

CREATE TABLE IF NOT EXISTS `assets` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_tag` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(255) NOT NULL,
  `type` ENUM('laptop','desktop','phone','tablet','printer','server','network','other') NOT NULL DEFAULT 'other',
  `brand` VARCHAR(100) DEFAULT NULL,
  `model` VARCHAR(100) DEFAULT NULL,
  `serial_number` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('active','in_repair','retired','available','ordered') NOT NULL DEFAULT 'available',
  `assigned_to_user_id` INT UNSIGNED DEFAULT NULL,
  `purchase_date` DATE DEFAULT NULL,
  `warranty_until` DATE DEFAULT NULL,
  `location` VARCHAR(255) DEFAULT NULL,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_assets_type` (`type`),
  INDEX `idx_assets_status` (`status`),
  INDEX `idx_assets_assigned` (`assigned_to_user_id`),
  INDEX `idx_assets_serial` (`serial_number`),
  FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_history` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id` INT UNSIGNED NOT NULL,
  `event_type` VARCHAR(50) NOT NULL,
  `description` TEXT,
  `performed_by` INT UNSIGNED DEFAULT NULL,
  `performed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_asset_history_asset` (`asset_id`),
  FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Orders
-- ============================================

CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(20) NOT NULL UNIQUE,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `requested_by` INT UNSIGNED NOT NULL,
  `approved_by` INT UNSIGNED DEFAULT NULL,
  `status` ENUM('requested','approved','ordered','shipped','delivered','completed','rejected') NOT NULL DEFAULT 'requested',
  `priority` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `estimated_delivery` DATE DEFAULT NULL,
  `actual_delivery` DATE DEFAULT NULL,
  `supplier` VARCHAR(255) DEFAULT NULL,
  `total_cost` DECIMAL(10,2) DEFAULT NULL,
  `rejection_reason` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_orders_status` (`status`),
  INDEX `idx_orders_requested_by` (`requested_by`),
  FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT UNSIGNED NOT NULL,
  `item_name` VARCHAR(255) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(10,2) DEFAULT NULL,
  `specs` TEXT,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_progress_steps` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT UNSIGNED NOT NULL,
  `step_name` VARCHAR(100) NOT NULL,
  `step_order` INT UNSIGNED NOT NULL,
  `status` ENUM('pending','active','completed') NOT NULL DEFAULT 'pending',
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  `completed_by` INT UNSIGNED DEFAULT NULL,
  `notes` TEXT,
  INDEX `idx_steps_order` (`order_id`),
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Network Monitoring
-- ============================================

CREATE TABLE IF NOT EXISTS `network_devices` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `type` ENUM('server','switch','router','printer','other') NOT NULL DEFAULT 'other',
  `description` TEXT,
  `is_monitored` TINYINT(1) NOT NULL DEFAULT 1,
  `location` VARCHAR(255) DEFAULT NULL,
  `added_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_network_monitored` (`is_monitored`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ping_results` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `device_id` INT UNSIGNED NOT NULL,
  `status` ENUM('up','down','timeout') NOT NULL,
  `response_time_ms` INT DEFAULT NULL,
  `checked_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ping_device` (`device_id`),
  INDEX `idx_ping_checked` (`checked_at`),
  FOREIGN KEY (`device_id`) REFERENCES `network_devices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Knowledge Base
-- ============================================

CREATE TABLE IF NOT EXISTS `kb_categories` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `icon` VARCHAR(50) DEFAULT NULL,
  `parent_id` INT UNSIGNED DEFAULT NULL,
  `sort_order` INT UNSIGNED DEFAULT 0,
  FOREIGN KEY (`parent_id`) REFERENCES `kb_categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_articles` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `content_html` LONGTEXT,
  `category_id` INT UNSIGNED DEFAULT NULL,
  `author_id` INT UNSIGNED DEFAULT NULL,
  `status` ENUM('draft','published') NOT NULL DEFAULT 'draft',
  `views` INT UNSIGNED DEFAULT 0,
  `helpful_votes` INT UNSIGNED DEFAULT 0,
  `unhelpful_votes` INT UNSIGNED DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_kb_category` (`category_id`),
  INDEX `idx_kb_status` (`status`),
  FULLTEXT INDEX `idx_kb_fulltext` (`title`, `content_html`),
  FOREIGN KEY (`category_id`) REFERENCES `kb_categories`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kb_tags` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `article_id` INT UNSIGNED NOT NULL,
  `tag` VARCHAR(50) NOT NULL,
  INDEX `idx_tags_article` (`article_id`),
  INDEX `idx_tags_tag` (`tag`),
  FOREIGN KEY (`article_id`) REFERENCES `kb_articles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Email Integration
-- ============================================

CREATE TABLE IF NOT EXISTS `email_accounts` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `imap_host` VARCHAR(255) NOT NULL,
  `imap_port` INT UNSIGNED NOT NULL DEFAULT 993,
  `imap_user` VARCHAR(255) NOT NULL,
  `imap_password_encrypted` TEXT NOT NULL,
  `smtp_host` VARCHAR(255) DEFAULT NULL,
  `smtp_port` INT UNSIGNED DEFAULT 587,
  `smtp_user` VARCHAR(255) DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` INT UNSIGNED DEFAULT NULL,
  `direction` ENUM('in','out') NOT NULL,
  `from_email` VARCHAR(255) NOT NULL,
  `to_email` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(500) DEFAULT NULL,
  `body` LONGTEXT,
  `message_id` VARCHAR(255) DEFAULT NULL,
  `received_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_email_ticket` (`ticket_id`),
  INDEX `idx_email_message_id` (`message_id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Settings
-- ============================================

CREATE TABLE IF NOT EXISTS `settings` (
  `key_name` VARCHAR(100) PRIMARY KEY,
  `value` TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Ticket Number Counter
-- ============================================

CREATE TABLE IF NOT EXISTS `ticket_counters` (
  `year` INT UNSIGNED PRIMARY KEY,
  `last_number` INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

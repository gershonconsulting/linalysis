-- Linalysis MySQL schema — Tomcat backend
-- Run against an empty database:
--   mysql -u root -p
--   CREATE DATABASE linalysis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   CREATE USER 'linalysis'@'localhost' IDENTIFIED BY '<strong password>';
--   GRANT ALL PRIVILEGES ON linalysis.* TO 'linalysis'@'localhost';
--   FLUSH PRIVILEGES;
--   USE linalysis;
--   SOURCE /path/to/schema.sql;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(255) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  full_name         VARCHAR(255) NULL,
  timezone          VARCHAR(64)  NOT NULL DEFAULT 'America/New_York',
  email_verified_at DATETIME     NULL,
  last_login_at     DATETIME     NULL,
  linkedin_profile  VARCHAR(512) NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           CHAR(64)     NOT NULL PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  expires_at   DATETIME     NOT NULL,
  user_agent   VARCHAR(255) NULL,
  ip_address   VARCHAR(45)  NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sessions_user    (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_tokens (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  token_hash    CHAR(64)     NOT NULL,
  name          VARCHAR(100) NULL,
  last_used_at  DATETIME     NULL,
  expires_at    DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_api_tokens_hash (token_hash),
  KEY idx_api_tokens_user (user_id),
  CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                INT UNSIGNED NOT NULL,
  stripe_customer_id     VARCHAR(64)  NULL,
  stripe_subscription_id VARCHAR(64)  NULL,
  plan                   VARCHAR(20)  NOT NULL DEFAULT 'free',
  status                 VARCHAR(20)  NOT NULL DEFAULT 'active',
  current_period_start   DATETIME     NULL,
  current_period_end     DATETIME     NULL,
  amount_cents           INT          NULL,
  currency               CHAR(3)      NOT NULL DEFAULT 'USD',
  cancel_at_period_end   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subscriptions_user (user_id),
  KEY idx_subscriptions_customer (stripe_customer_id),
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- LinkedIn stats — one row per (user, day). Column names mirror the Chrome
-- extension's CSV export 1:1.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_stats (
  id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                     INT UNSIGNED NOT NULL,
  captured_at                 DATE         NOT NULL,
  connections                 INT          NULL,
  search_appearances          INT          NULL,
  profile_views               INT          NULL,
  invitations                 INT          NULL,
  ssi_industry_rank           INT          NULL,
  ssi_network_rank            INT          NULL,
  ssi_overall                 TINYINT      NULL,
  company_followers           INT          NULL,
  company_search_appearances  INT          NULL,
  company_unique_visitors     INT          NULL,
  company_new_followers       INT          NULL,
  company_post_impressions    INT          NULL,
  company_custom_clicks       INT          NULL,
  company_credits_available   INT          NULL,
  company_credits_total       INT          NULL,
  raw_json                    JSON         NULL,
  created_at                  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stats_user_day (user_id, captured_at),
  KEY idx_stats_user (user_id),
  KEY idx_stats_date (captured_at),
  CONSTRAINT fk_stats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_deliveries (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  report_type    VARCHAR(20)  NOT NULL,
  period_start   DATE         NOT NULL,
  period_end     DATE         NOT NULL,
  scheduled_for  DATETIME     NOT NULL,
  sent_at        DATETIME     NULL,
  opened_at      DATETIME     NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
  subject        VARCHAR(255) NULL,
  error_message  TEXT         NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reports_user   (user_id),
  KEY idx_reports_sched  (scheduled_for),
  KEY idx_reports_status (status),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider       VARCHAR(20)  NOT NULL,
  event_id       VARCHAR(100) NOT NULL,
  event_type     VARCHAR(100) NOT NULL,
  payload        JSON         NULL,
  processed_at   DATETIME     NULL,
  error_message  TEXT         NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webhook_event (provider, event_id),
  KEY idx_webhook_type   (event_type),
  KEY idx_webhook_status (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  id          CHAR(64)     NOT NULL PRIMARY KEY,
  bucket_key  VARCHAR(128) NOT NULL,
  bucket_ts   BIGINT       NOT NULL,
  hits        INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at  DATETIME     NOT NULL,
  KEY idx_rate_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pwreset_hash (token_hash),
  KEY idx_pwreset_user (user_id),
  CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NULL,
  action     VARCHAR(64)  NOT NULL,
  entity     VARCHAR(64)  NULL,
  entity_id  VARCHAR(64)  NULL,
  metadata   JSON         NULL,
  ip_address VARCHAR(45)  NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_user   (user_id),
  KEY idx_audit_action (action),
  KEY idx_audit_time   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

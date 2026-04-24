-- Linalysis MySQL schema
-- Portable between Hostinger MySQL and AWS RDS MySQL 8.x.
-- Every table has surrogate id + created_at/updated_at for auditability.
-- UTF-8 mb4 throughout so emoji + non-Latin names work.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- -----------------------------------------------------------------------
-- Users (account holders)
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
-- Sessions (cookie-based browser auth). Row id = SHA-256 of session token.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           CHAR(64)     NOT NULL PRIMARY KEY,  -- sha256 hex
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
-- API tokens (Bearer-style, used by the Chrome extension).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_tokens (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  token_hash    CHAR(64)     NOT NULL,  -- sha256 hex of raw token (prefix lnz_)
  name          VARCHAR(100) NULL,       -- user-friendly label ("My laptop", "Work Chrome")
  last_used_at  DATETIME     NULL,
  expires_at    DATETIME     NULL,       -- null = never expires
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_api_tokens_hash (token_hash),
  KEY idx_api_tokens_user (user_id),
  CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- Subscriptions (one row per user; Stripe is source of truth).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                INT UNSIGNED NOT NULL,
  stripe_customer_id     VARCHAR(64)  NULL,
  stripe_subscription_id VARCHAR(64)  NULL,
  plan                   VARCHAR(20)  NOT NULL DEFAULT 'free', -- free | silver | gold | platinum
  status                 VARCHAR(20)  NOT NULL DEFAULT 'active', -- active | trialing | past_due | canceled
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
-- LinkedIn stats — one row per (user, day). Column names mirror the exact
-- CSV headers collected by the Chrome extension so ingestion is a 1:1 map.
-- CSV header ────────────────────────── → column
-- Date                                  captured_at
-- Connections                           connections
-- Search Appearance                     search_appearances
-- Views                                 profile_views
-- Invitations                           invitations
-- SSI Industry                          ssi_industry_rank
-- SSI Network                           ssi_network_rank
-- SSI                                   ssi_overall
-- Company Followers                     company_followers
-- Company Search Appearances            company_search_appearances
-- Company Unique Visitors               company_unique_visitors
-- Company New Followers                 company_new_followers
-- Company Post Impressions              company_post_impressions
-- Company Custom Clicks                 company_custom_clicks
-- Company Credits Available             company_credits_available
-- Company Credits Total                 company_credits_total
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_stats (
  id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                     INT UNSIGNED NOT NULL,
  captured_at                 DATE         NOT NULL,
  connections                 INT          NULL,
  search_appearances          INT          NULL,
  profile_views               INT          NULL,
  invitations                 INT          NULL,
  ssi_industry_rank           INT          NULL,   -- smaller is better (percentile rank)
  ssi_network_rank            INT          NULL,
  ssi_overall                 TINYINT      NULL,   -- 0-100
  company_followers           INT          NULL,
  company_search_appearances  INT          NULL,
  company_unique_visitors     INT          NULL,
  company_new_followers       INT          NULL,
  company_post_impressions    INT          NULL,
  company_custom_clicks       INT          NULL,
  company_credits_available   INT          NULL,
  company_credits_total       INT          NULL,
  raw_json                    JSON         NULL,   -- future-proof for fields we haven't mapped yet
  created_at                  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stats_user_day (user_id, captured_at),
  KEY idx_stats_user          (user_id),
  KEY idx_stats_date          (captured_at),
  CONSTRAINT fk_stats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- Report deliveries (weekly / monthly digest emails).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_deliveries (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  report_type    VARCHAR(20)  NOT NULL,             -- 'weekly' | 'monthly'
  period_start   DATE         NOT NULL,
  period_end     DATE         NOT NULL,
  scheduled_for  DATETIME     NOT NULL,
  sent_at        DATETIME     NULL,
  opened_at      DATETIME     NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed' | 'skipped'
  subject        VARCHAR(255) NULL,
  error_message  TEXT         NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reports_user    (user_id),
  KEY idx_reports_sched   (scheduled_for),
  KEY idx_reports_status  (status),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- Webhook events (Stripe etc.) — idempotency log + audit trail.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider       VARCHAR(20)  NOT NULL,              -- 'stripe'
  event_id       VARCHAR(100) NOT NULL,              -- evt_...
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
-- Rate limits (coarse bucket counter).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  id          CHAR(64)     NOT NULL PRIMARY KEY,  -- sha256(key|bucket)
  bucket_key  VARCHAR(128) NOT NULL,
  bucket_ts   BIGINT       NOT NULL,
  hits        INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at  DATETIME     NOT NULL,
  KEY idx_rate_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- Password reset tokens (short-lived, single-use).
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
-- Audit log (optional but cheap insurance).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NULL,
  action     VARCHAR(64) NOT NULL,              -- 'login' 'signup' 'ingest' 'plan_changed' ...
  entity     VARCHAR(64) NULL,
  entity_id  VARCHAR(64) NULL,
  metadata   JSON        NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_user   (user_id),
  KEY idx_audit_action (action),
  KEY idx_audit_time   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

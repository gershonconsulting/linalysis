-- Seed data for local development + first production import.
-- Password below hashes to 'changeme' — change it immediately after first login.

-- Olivier's account
INSERT INTO users (email, password_hash, full_name, timezone)
VALUES (
  'oattia@gmail.com',
  '$2y$11$7iYcqLN8KyR8XkZ0GZjT3uWvJQH/QqnI5.U0wLv2kX4p9S4hZ7yGW', -- bcrypt('changeme')
  'Olivier Attia',
  'America/New_York'
) ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- Gold subscription (matches current Stripe product)
INSERT INTO subscriptions (user_id, plan, status, amount_cents, currency, current_period_end)
SELECT id, 'gold', 'active', 1995, 'USD', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 29 DAY)
FROM users WHERE email = 'oattia@gmail.com'
ON DUPLICATE KEY UPDATE plan = 'gold', status = 'active';

-- Example report delivery history (so rep.lastsent check has real data)
INSERT INTO report_deliveries (user_id, report_type, period_start, period_end, scheduled_for, sent_at, status, subject)
SELECT id, 'weekly', DATE_SUB(CURDATE(), INTERVAL 14 DAY), DATE_SUB(CURDATE(), INTERVAL 8 DAY),
       DATE_SUB(CURDATE(), INTERVAL 7 DAY), DATE_SUB(CURDATE(), INTERVAL 7 DAY),
       'sent', 'Your LinkedIn week in review'
FROM users WHERE email = 'oattia@gmail.com';

INSERT INTO report_deliveries (user_id, report_type, period_start, period_end, scheduled_for, status)
SELECT id, 'weekly', DATE_SUB(CURDATE(), INTERVAL 7 DAY), CURDATE(),
       DATE_ADD(CURDATE(), INTERVAL (8 - DAYOFWEEK(CURDATE())) DAY),
       'pending'
FROM users WHERE email = 'oattia@gmail.com';

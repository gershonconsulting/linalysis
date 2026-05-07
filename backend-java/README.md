# Linalysis API — Java + Tomcat

Backend for **linalysis.com**. Vanilla servlets, no framework. Targets Tomcat 10+ (Jakarta EE 10 namespace) with plain JDBC to MySQL 8.

## What's in the box

```
backend-java/
├── build.sh                       — one-command javac → WAR
├── sql/schema.sql                 — MySQL DDL (run once)
├── src/com/linalysis/
│   ├── Config.java                — loads linalysis.properties
│   ├── db/Db.java                 — JDBC helpers
│   ├── auth/Auth.java             — session + API token auth
│   ├── auth/RateLimit.java        — coarse MySQL-backed limiter
│   ├── util/{Json,Cors,Password}  — JDK-only helpers
│   └── servlets/                  — 16 endpoints, one class per concern
└── web/WEB-INF/
    ├── web.xml                    — servlet mappings
    ├── classes/linalysis.properties.example
    └── lib/                       — drop-in JARs (see below)
```

## Dependencies (the entire list)

Three JARs. Drop them into `web/WEB-INF/lib/` before building. `build.sh` tells you which are missing.

| JAR | Size | Purpose | Source |
|---|---|---|---|
| `mysql-connector-j-8.4.0.jar` | ~2.5 MB | JDBC driver | https://dev.mysql.com/downloads/connector/j/ |
| `json-20240303.jar` | ~75 KB | JSON parse/build (`org.json`) | https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar |
| `jakarta.servlet-api-6.0.0.jar` | ~100 KB | Servlet API (compile only; Tomcat provides at runtime) | https://repo1.maven.org/maven2/jakarta/servlet/jakarta.servlet-api/6.0.0/jakarta.servlet-api-6.0.0.jar |

**That's it.** No Spring, no Hibernate, no Jackson, no Gson, no Lombok, no Guava. Password hashing (PBKDF2), Stripe signature verification (HMAC-SHA256), random tokens (SecureRandom) — all JDK built-in.

## One-time setup — developer's checklist

### 1. Install the stack

```bash
# Ubuntu / Debian
sudo apt install default-jdk tomcat10 mysql-server

# macOS
brew install temurin@17 tomcat mysql-server

# Verify
java --version    # want 17+
```

### 2. Create the database

```sql
mysql -u root -p
CREATE DATABASE linalysis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'linalysis'@'localhost' IDENTIFIED BY '<strong password>';
GRANT ALL PRIVILEGES ON linalysis.* TO 'linalysis'@'localhost';
FLUSH PRIVILEGES;
USE linalysis;
SOURCE /path/to/backend-java/sql/schema.sql;
```

### 3. Configure the app

```bash
cd backend-java/web/WEB-INF/classes
cp linalysis.properties.example linalysis.properties
vim linalysis.properties   # fill in db.pass, stripe.webhook.secret, etc.
```

### 4. Get the JARs

```bash
cd backend-java/web/WEB-INF/lib
wget https://repo1.maven.org/maven2/jakarta/servlet/jakarta.servlet-api/6.0.0/jakarta.servlet-api-6.0.0.jar
wget https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar
# mysql-connector-j — grab the latest 8.x .jar from:
#   https://dev.mysql.com/downloads/connector/j/ (Platform-independent, unpack, copy the .jar)
```

### 5. Build the WAR

```bash
cd backend-java
./build.sh
# Produces: dist/linalysis-api.war
```

### 6. Deploy

```bash
sudo cp dist/linalysis-api.war /var/lib/tomcat10/webapps/
sudo systemctl restart tomcat10
# Tomcat auto-unpacks it into webapps/linalysis-api/
```

### 7. Verify

```bash
curl http://localhost:8080/linalysis-api/api/health
# → {"status":"ok","services":{"database":"ok","api":"ok"},"time":"...","version":"dev"}
```

## Production wiring

### Reverse proxy (nginx or Apache)

Serve `api.linalysis.com` and proxy to Tomcat's `/linalysis-api/`:

```nginx
# /etc/nginx/sites-available/api.linalysis.com
server {
    listen 443 ssl http2;
    server_name api.linalysis.com;

    ssl_certificate     /etc/letsencrypt/live/api.linalysis.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.linalysis.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080/linalysis-api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }
}
```

`sudo certbot --nginx -d api.linalysis.com` issues the cert.

### Stripe webhook

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://api.linalysis.com/api/stripe/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`
4. Copy the signing secret → `stripe.webhook.secret` in `linalysis.properties`
5. Restart Tomcat

### Environment variables (optional)

Every `linalysis.properties` key can be overridden by `LINALYSIS_<KEY>` env var. Useful in Tomcat's `setenv.sh`:

```bash
# /var/lib/tomcat10/bin/setenv.sh
export LINALYSIS_DB_PASS="..."
export LINALYSIS_STRIPE_WEBHOOK_SECRET="whsec_..."
```

Keeps secrets out of `linalysis.properties` if you'd rather.

## API reference (16 endpoints)

| Method | Path                          | Auth       |
|--------|-------------------------------|------------|
| GET    | `/api/health`                 | none       |
| GET    | `/api/version`                | none       |
| POST   | `/api/auth/signup`            | none       |
| POST   | `/api/auth/login`             | none       |
| POST   | `/api/auth/logout`            | cookie     |
| GET    | `/api/auth/me`                | cookie     |
| POST   | `/api/auth/forgot`            | none       |
| POST   | `/api/auth/reset`             | reset tok  |
| GET    | `/api/account`                | cookie     |
| GET    | `/api/account/subscription`   | cookie     |
| GET    | `/api/account/usage`          | cookie     |
| POST   | `/api/account/token`          | cookie     |
| GET    | `/api/data/summary`           | cookie/API |
| GET    | `/api/data/connections?range` | cookie/API |
| GET    | `/api/data/ssi?range`         | cookie/API |
| GET    | `/api/data/company?range`     | cookie/API |
| POST   | `/api/ingest/linkedin`        | API token  |
| GET    | `/api/reports/list`           | cookie     |
| GET    | `/api/reports/next`           | cookie     |
| POST   | `/api/stripe/webhook`         | signature  |

Same semantics as the Cloudflare Worker version (`/worker/src/index.mjs`) — that runs today as a stopgap, and this Java version replaces it 1:1. The frontend (`api.js`) works against either.

## Weekly reports (optional)

The schema has `report_deliveries` but there's no cron job yet. Two options when ready:
- **Tomcat:** wire a `ServletContextListener` + `ScheduledExecutorService` (JDK-only, ~40 lines).
- **External:** cron on the host runs `curl -u <secret> http://localhost:8080/linalysis-api/api/internal/run-weekly`.

Let me know which you want and I'll drop it in.

## What's not here yet (intentional)

- **Email sending** — `AuthServlet.forgot()` currently logs the reset link. Add `jakarta.mail-2.0.1.jar` + 20 lines to send for real, when you've picked SMTP vs Resend/SES.
- **Connection pool** — `Db.java` opens a new connection per query. Fine at low traffic. Swap for Tomcat JDBC pool (built-in, no extra JAR) via `context.xml` when traffic warrants.
- **Cron/scheduled work** — see above.

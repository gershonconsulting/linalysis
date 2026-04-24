<?php
declare(strict_types=1);

namespace Linalysis\Core;

/**
 * Coarse-grained rate limit using a single table. Not as tight as Redis/KV,
 * but good enough for brute-force-protection on auth + extension ingest.
 */
final class RateLimit
{
    /**
     * @throws \RuntimeException if over the limit (caller catches → 429).
     */
    public static function hit(string $key, int $limit, int $windowSeconds): void
    {
        $bucket = floor(time() / $windowSeconds);
        $id = hash('sha256', $key . '|' . $bucket);

        Db::execute(
            "INSERT INTO rate_limits (id, bucket_key, bucket_ts, hits, expires_at)
             VALUES (:id, :k, :ts, 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :w SECOND))
             ON DUPLICATE KEY UPDATE hits = hits + 1",
            ['id' => $id, 'k' => $key, 'ts' => (int)$bucket, 'w' => $windowSeconds]
        );

        $count = (int) Db::fetchOne(
            "SELECT hits FROM rate_limits WHERE id = :id",
            ['id' => $id]
        )['hits'];

        if ($count > $limit) {
            throw new RateLimitExceeded(retryAfter: $windowSeconds - (time() % $windowSeconds));
        }
    }
}

final class RateLimitExceeded extends \RuntimeException
{
    public function __construct(public readonly int $retryAfter)
    {
        parent::__construct('Rate limit exceeded.');
    }
}

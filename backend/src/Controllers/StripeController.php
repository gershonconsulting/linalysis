<?php
declare(strict_types=1);

namespace Linalysis\Controllers;

use Linalysis\Core\{Config, Db, Request, Response};
use Stripe\Stripe;
use Stripe\Webhook;

/**
 * Stripe webhook handler.
 *
 * Configure in Stripe Dashboard → Developers → Webhooks:
 *   Endpoint URL:  https://api.linalysis.net/api/stripe/webhook
 *   Events:
 *     checkout.session.completed
 *     customer.subscription.created
 *     customer.subscription.updated
 *     customer.subscription.deleted
 *     invoice.payment_succeeded
 *     invoice.payment_failed
 */
final class StripeController
{
    public function webhook(Request $req): Response
    {
        $secret = Config::get('STRIPE_WEBHOOK_SECRET');
        $sig = $req->headers['stripe-signature'] ?? '';

        if (!$secret || !$sig) {
            return Response::error('unconfigured', 'Stripe webhook not configured.', 500);
        }

        try {
            $event = Webhook::constructEvent($req->body, $sig, $secret);
        } catch (\Throwable $e) {
            error_log('[stripe] signature verify failed: ' . $e->getMessage());
            return Response::error('invalid_signature', '', 400);
        }

        // Idempotency guard
        try {
            Db::execute(
                "INSERT INTO webhook_events (provider, event_id, event_type, payload)
                 VALUES ('stripe', :id, :type, :payload)",
                [
                    'id' => $event->id,
                    'type' => $event->type,
                    'payload' => json_encode($event->toArray()),
                ]
            );
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') {
                // Duplicate event → already processed
                return Response::json(['ok' => true, 'duplicate' => true]);
            }
            throw $e;
        }

        try {
            $this->handle($event);
            Db::execute(
                "UPDATE webhook_events SET processed_at = UTC_TIMESTAMP() WHERE event_id = :id",
                ['id' => $event->id]
            );
        } catch (\Throwable $e) {
            error_log("[stripe] handle {$event->type} failed: " . $e->getMessage());
            Db::execute(
                "UPDATE webhook_events SET error_message = :m WHERE event_id = :id",
                ['id' => $event->id, 'm' => substr($e->getMessage(), 0, 500)]
            );
            // Return 200 so Stripe doesn't retry forever; we'll replay from our table
            return Response::json(['ok' => false, 'handled' => false]);
        }

        return Response::json(['ok' => true]);
    }

    private function handle(\Stripe\Event $event): void
    {
        $obj = $event->data->object;

        switch ($event->type) {
            case 'checkout.session.completed':
                $email = strtolower($obj->customer_details->email ?? $obj->customer_email ?? '');
                if (!$email) return;
                $user = Db::fetchOne('SELECT id FROM users WHERE email = :e', ['e' => $email]);
                if (!$user) return;
                Db::execute(
                    "INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status)
                     VALUES (:u, :c, :s, 'gold', 'active')
                     ON DUPLICATE KEY UPDATE stripe_customer_id = VALUES(stripe_customer_id),
                                             stripe_subscription_id = VALUES(stripe_subscription_id),
                                             status = 'active'",
                    ['u' => $user['id'], 'c' => $obj->customer ?? null, 's' => $obj->subscription ?? null]
                );
                break;

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                $this->syncSubscription($obj);
                break;

            case 'customer.subscription.deleted':
                Db::execute(
                    "UPDATE subscriptions SET status = 'canceled', plan = 'free'
                     WHERE stripe_subscription_id = :s",
                    ['s' => $obj->id]
                );
                break;

            case 'invoice.payment_succeeded':
            case 'invoice.payment_failed':
                // status will be updated by the subscription.updated event that follows
                break;
        }
    }

    private function syncSubscription(\Stripe\Subscription $sub): void
    {
        $customerId = $sub->customer;
        $row = Db::fetchOne(
            'SELECT user_id FROM subscriptions WHERE stripe_customer_id = :c',
            ['c' => $customerId]
        );
        if (!$row) {
            // Look up by email via Stripe API
            Stripe::setApiKey(Config::get('STRIPE_SECRET_KEY'));
            $customer = \Stripe\Customer::retrieve($customerId);
            $email = strtolower($customer->email ?? '');
            $user = Db::fetchOne('SELECT id FROM users WHERE email = :e', ['e' => $email]);
            if (!$user) return;
            $userId = $user['id'];
        } else {
            $userId = $row['user_id'];
        }

        $amountCents = null;
        $plan = 'free';
        if ($sub->items && count($sub->items->data) > 0) {
            $price = $sub->items->data[0]->price;
            $amountCents = $price->unit_amount;
            $plan = $this->planFromAmount($amountCents);
        }

        Db::execute(
            "INSERT INTO subscriptions
               (user_id, stripe_customer_id, stripe_subscription_id, plan, status,
                current_period_start, current_period_end, amount_cents, currency, cancel_at_period_end)
             VALUES (:u, :c, :s, :p, :st, FROM_UNIXTIME(:pstart), FROM_UNIXTIME(:pend), :amt, :cur, :cancel)
             ON DUPLICATE KEY UPDATE
               stripe_customer_id     = VALUES(stripe_customer_id),
               stripe_subscription_id = VALUES(stripe_subscription_id),
               plan                   = VALUES(plan),
               status                 = VALUES(status),
               current_period_start   = VALUES(current_period_start),
               current_period_end     = VALUES(current_period_end),
               amount_cents           = VALUES(amount_cents),
               currency               = VALUES(currency),
               cancel_at_period_end   = VALUES(cancel_at_period_end)",
            [
                'u' => $userId,
                'c' => $customerId,
                's' => $sub->id,
                'p' => $plan,
                'st' => $sub->status,
                'pstart' => $sub->current_period_start,
                'pend' => $sub->current_period_end,
                'amt' => $amountCents,
                'cur' => strtoupper($sub->currency ?? 'USD'),
                'cancel' => $sub->cancel_at_period_end ? 1 : 0,
            ]
        );
    }

    private function planFromAmount(?int $cents): string
    {
        return match (true) {
            $cents === null    => 'free',
            $cents <  1000     => 'silver',   // $9.95
            $cents <  2500     => 'gold',     // $19.95
            default            => 'platinum', // $29.95+
        };
    }
}

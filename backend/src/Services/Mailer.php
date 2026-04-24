<?php
declare(strict_types=1);

namespace Linalysis\Services;

use Linalysis\Core\Config;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

/**
 * Thin wrapper around PHPMailer — one class to swap out for AWS SES later.
 */
final class Mailer
{
    public function send(string $to, string $subject, string $body, bool $isHtml = false): void
    {
        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host       = Config::get('SMTP_HOST', 'smtp.hostinger.com');
            $mail->SMTPAuth   = true;
            $mail->Username   = Config::get('SMTP_USER');
            $mail->Password   = Config::get('SMTP_PASS');
            $secure           = Config::get('SMTP_SECURE', 'ssl');
            $mail->SMTPSecure = $secure === 'tls' ? PHPMailer::ENCRYPTION_STARTTLS : PHPMailer::ENCRYPTION_SMTPS;
            $mail->Port       = Config::getInt('SMTP_PORT', 465);

            $mail->setFrom(
                Config::get('SMTP_FROM_EMAIL', 'support@linalysis.net'),
                Config::get('SMTP_FROM_NAME', 'Linalysis')
            );
            $mail->addAddress($to);
            $mail->isHTML($isHtml);
            $mail->Subject = $subject;
            $mail->Body    = $body;

            $mail->send();
        } catch (Exception $e) {
            throw new \RuntimeException('Email send failed: ' . $mail->ErrorInfo);
        }
    }
}

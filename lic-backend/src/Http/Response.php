<?php
declare(strict_types=1);

namespace Jackisa\Lic\Http;

/**
 * JSON API envelope, mirroring the jackisa.com mobile API shape
 * (`api_status` + `data` / `errors`).
 */
final class Response
{
    /** @param array<string,mixed> $data */
    public static function ok(array $data = [], string $status = '200', array $extra = []): void
    {
        self::emit(array_merge([
            'api_status'  => $status,
            'api_version' => '1.0',
            'data'        => $data,
        ], $extra), (int) $status);
    }

    /** @param array<string,mixed> $extra */
    public static function error(string $errorId, string $text, int $httpStatus = 400, array $extra = []): void
    {
        self::emit(array_merge([
            'api_status'  => (string) $httpStatus,
            'api_version' => '1.0',
            'errors'      => [
                'error_id'   => $errorId,
                'error_text' => $text,
            ],
        ], $extra), $httpStatus);
    }

    /** @param array<string,mixed> $payload */
    public static function emit(array $payload, int $httpStatus = 200): void
    {
        if (!headers_sent()) {
            http_response_code($httpStatus);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store');
        }
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}

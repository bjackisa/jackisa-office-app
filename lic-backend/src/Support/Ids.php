<?php
declare(strict_types=1);

namespace Jackisa\Lic\Support;

final class Ids
{
    public static function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public static function random(int $bytes = 32): string
    {
        return bin2hex(random_bytes($bytes));
    }

    public static function licenseKey(): string
    {
        // Groups of 5 chars, 5 groups => 25 chars. Ambiguous glyphs removed.
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $groups = [];
        for ($g = 0; $g < 5; $g++) {
            $chunk = '';
            for ($i = 0; $i < 5; $i++) {
                $chunk .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $groups[] = $chunk;
        }
        return implode('-', $groups);
    }

    public static function serial(): string
    {
        return 'JLIC-' . strtoupper(bin2hex(random_bytes(6)));
    }
}

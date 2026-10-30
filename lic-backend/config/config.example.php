<?php
/**
 * Jackisa License Hub — configuration template.
 *
 * Copy to config.local.php (never committed) and fill in the real values.
 * Every value can also be supplied through environment variables, which take
 * precedence over this file — useful for cron/CLI runs.
 */

return [
    'app' => [
        'name'      => 'Jackisa License Hub',
        'env'       => 'production',
        'debug'     => false,
        'base_url'  => 'https://lic.jackisa.com',
        'timezone'  => 'UTC',
    ],

    // Central synchronised MySQL database on lic.
    'db' => [
        'host'     => '127.0.0.1',
        'port'     => 3306,
        'database' => 'u388105230_jackisasynccp',
        'username' => 'u388105230_jackisasynccp',
        'password' => '',
        'charset'  => 'utf8mb4',
    ],

    // HMAC secret used to sign licence certificates. Rotating it invalidates
    // every outstanding certificate, so change it only deliberately.
    'license' => [
        'signing_secret' => 'CHANGE-ME-TO-A-LONG-RANDOM-STRING',
        'grace_days'     => 5,
        'trial_days'     => 7,
        'trial_reminder_days' => 2,
    ],

    // SMTP — the SAME server jackisa.com uses.
    'mail' => [
        'host'       => 'mail.spacemail.com',
        'port'       => 465,
        'username'   => 'barack@jackisa.com',
        'password'   => '',
        'encryption' => 'ssl',
        'from_email' => 'barack@jackisa.com',
        'from_name'  => 'Jackisa Office',
    ],

    // Whapi.Cloud — the SAME account jackisa.com uses.
    'whapi' => [
        'token'   => '',
        'base_url'=> 'https://gate.whapi.cloud/',
    ],

    // JPesa mobile money rail.
    'jpesa' => [
        'api_url'   => 'https://my.jpesa.com/api/',
        'api_key'   => '',
        'currency'  => 'UGX',
        'fee_rate'  => 0.03,
        'enabled'   => true,
    ],

    // Peers we synchronise with.
    'peers' => [
        'jackisa' => [
            'base_url'   => 'https://jackisa.com',
            'bridge_url' => 'https://jackisa.com/office_bridge.php',
            'shared_secret' => 'CHANGE-ME-JACKISA-BRIDGE-SECRET',
        ],
        'office' => [
            'base_url'   => 'https://office.jackisa.com',
            'shared_secret' => 'CHANGE-ME-OFFICE-SHARED-SECRET',
        ],
    ],

    // Income-tax computation. The presumptive threshold is the chargeable-income
    // ceiling under which the 1% small-business rate applies; above it the
    // standard 30% corporate rate is used. Adjust when a Finance Act changes it.
    'tax' => [
        'presumptive_threshold' => 150000000,
    ],

    // HTML -> PDF rendering. 'auto' uses a Dompdf install when one is present
    // (pdf.dompdf_autoload) or a wkhtmltopdf binary (pdf.binary), otherwise the
    // built-in fallback writer is used.
    'pdf' => [
        'engine'           => 'auto',
        'dompdf_autoload'  => '',
        'binary'           => '',
    ],

    // CORS origins allowed to call this API from a browser.
    'cors' => [
        'allowed_origins' => [
            'https://office.jackisa.com',
            'https://jackisa.com',
            'https://www.jackisa.com',
        ],
    ],
];

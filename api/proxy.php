<?php
/**
 * ══════════════════════════════════════════════════════════════
 *  GMM Billing Solutions — Assessment Portal
 *  api/proxy.php  |  OPTIONAL PHP proxy for cPanel/shared hosts
 *
 *  Use this ONLY if your website host blocks direct calls to
 *  script.google.com (some shared hosting providers do this).
 *
 *  HOW TO USE:
 *  1. Upload this file to your server at: /api/proxy.php
 *  2. In js/app.js, change the gasCall() function to POST to
 *     '/api/proxy.php' instead of directly to GAS_URL.
 *     (See the commented section at the bottom of this file.)
 *  3. Set your APPS_SCRIPT_URL constant below.
 *
 *  NOTE: Most modern shared hosts (SiteGround, Hostinger, etc.)
 *  can call external URLs directly from JavaScript without this
 *  proxy. Try without it first.
 * ══════════════════════════════════════════════════════════════
 */

// ── YOUR GOOGLE APPS SCRIPT URL ───────────────────────────────
define('APPS_SCRIPT_URL', 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec');

// ── CORS ──────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// ── READ REQUEST BODY ─────────────────────────────────────────
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data) {
    echo json_encode(['success' => false, 'message' => 'Invalid JSON body']);
    exit;
}

// ── FORWARD TO GOOGLE APPS SCRIPT ────────────────────────────
$context = stream_context_create([
    'http' => [
        'method'        => 'POST',
        'header'        => "Content-Type: text/plain\r\n",
        'content'       => $raw,
        'timeout'       => 15,
        'ignore_errors' => true,
        'follow_location' => true,
        'max_redirects' => 5,
    ],
    'ssl' => [
        'verify_peer'      => true,
        'verify_peer_name' => true,
    ]
]);

$response = file_get_contents(APPS_SCRIPT_URL, false, $context);

if ($response === false) {
    // Try cURL as fallback
    if (function_exists('curl_init')) {
        $ch = curl_init(APPS_SCRIPT_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $raw,
            CURLOPT_HTTPHEADER     => ['Content-Type: text/plain'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $response = curl_exec($ch);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            echo json_encode(['success' => false, 'message' => 'cURL error: ' . $curlErr]);
            exit;
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Could not reach Apps Script. Enable allow_url_fopen or cURL.']);
        exit;
    }
}

// ── RETURN GAS RESPONSE TO BROWSER ───────────────────────────
// Strip any JSONP wrapper Google sometimes adds
$clean = preg_replace('/^[\w]+\(/', '', trim($response));
$clean = preg_replace('/\);\s*$/', '', $clean);

// Validate it's JSON before forwarding
$decoded = json_decode($clean, true);
if ($decoded !== null) {
    echo json_encode($decoded);
} else {
    // Return raw if we can't parse it
    echo $clean;
}

/*
 * ── TO USE THIS PROXY, update gasCall() in js/app.js ──────────
 *
 * Replace:
 *
 *   async function gasCall(data) {
 *     if(!GAS_URL) throw new Error('No Apps Script URL configured');
 *     const resp = await fetch(GAS_URL, { ... });
 *     ...
 *   }
 *
 * With:
 *
 *   async function gasCall(data) {
 *     const resp = await fetch('/api/proxy.php', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify(data)
 *     });
 *     if (!resp.ok) throw new Error('HTTP ' + resp.status);
 *     return resp.json();
 *   }
 *
 * ────────────────────────────────────────────────────────────── */
?>

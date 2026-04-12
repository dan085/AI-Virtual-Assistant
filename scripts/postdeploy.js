#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Runs automatically after `firebase deploy --only hosting` completes
 * (wired via the `hosting.postdeploy` hook in firebase.json).
 *
 * Responsibilities:
 *   1. Resolve the hosting URL for the active Firebase project.
 *   2. Smoke-test the site root + the /api/health endpoint.
 *   3. Log a clear summary to the terminal.
 *   4. Optionally POST a JSON payload to DEPLOY_WEBHOOK_URL
 *      (e.g. Slack / Discord incoming webhook) if that env var is set.
 *
 * This script has no npm dependencies — it uses Node 18+ built-ins
 * (fetch, fs, child_process).
 */

'use strict';

const { readFileSync } = require('node:fs');
const { execSync } = require('node:child_process');
const path = require('node:path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function log(msg) {
  console.log(`${DIM}[postdeploy]${RESET} ${msg}`);
}

function ok(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function warn(msg) {
  console.log(`${YELLOW}!${RESET} ${msg}`);
}

function fail(msg) {
  console.log(`${RED}✗${RESET} ${msg}`);
}

function readProjectId() {
  // Prefer the env var Firebase CLI exports while deploying.
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.FIREBASE_PROJECT) return process.env.FIREBASE_PROJECT;

  // Fall back to .firebaserc default.
  const rcPath = path.resolve(__dirname, '..', '.firebaserc');
  try {
    const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
    return rc.projects && rc.projects.default;
  } catch {
    return null;
  }
}

function resolveHostingUrl(projectId) {
  // 1. Explicit override (CI can set this for preview channels).
  if (process.env.HOSTING_URL) return process.env.HOSTING_URL;

  // 2. Try to read the JSON output of the CLI.
  try {
    const out = execSync(
      `firebase hosting:sites:list --project ${projectId} --json`,
      { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' },
    );
    const parsed = JSON.parse(out);
    const sites = parsed?.result?.sites ?? [];
    const site = sites.find((s) => s.type === 'DEFAULT_SITE') ?? sites[0];
    if (site?.defaultUrl) return site.defaultUrl;
  } catch {
    // CLI not available (non-deploy context) — fall through.
  }

  // 3. Convention-based fallback.
  if (projectId) return `https://${projectId}.web.app`;
  return null;
}

async function smokeTest(url) {
  log(`Smoke-testing ${BOLD}${url}${RESET}`);
  const started = Date.now();

  // Root
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      fail(`GET / -> ${res.status} ${res.statusText}`);
      return false;
    }
    ok(`GET / -> ${res.status} (${Date.now() - started}ms)`);
  } catch (err) {
    fail(`GET / failed: ${err.message}`);
    return false;
  }

  // Health endpoint (served by the `api` Cloud Function via rewrites)
  const healthUrl = `${url.replace(/\/$/, '')}/api/health`;
  try {
    const res = await fetch(healthUrl);
    if (!res.ok) {
      warn(`GET /api/health -> ${res.status} (function may still be cold)`);
    } else {
      const body = await res.json().catch(() => ({}));
      ok(`GET /api/health -> ${res.status} ${JSON.stringify(body)}`);
    }
  } catch (err) {
    warn(`GET /api/health failed: ${err.message}`);
  }

  return true;
}

async function notifyWebhook(projectId, url, healthy) {
  const hook = process.env.DEPLOY_WEBHOOK_URL;
  if (!hook) return;

  const payload = {
    text: [
      healthy ? ':rocket: *Deploy successful*' : ':warning: *Deploy completed with warnings*',
      `• Project: \`${projectId}\``,
      `• URL: ${url}`,
      `• Time: ${new Date().toISOString()}`,
    ].join('\n'),
  };

  try {
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      ok('Webhook notification sent');
    } else {
      warn(`Webhook returned ${res.status}`);
    }
  } catch (err) {
    warn(`Webhook failed: ${err.message}`);
  }
}

async function main() {
  console.log('');
  console.log(`${BOLD}═══ Firebase Hosting post-deploy ═══${RESET}`);

  const projectId = readProjectId();
  if (!projectId) {
    warn('Could not determine Firebase project id — skipping smoke test.');
    return;
  }
  log(`Project: ${BOLD}${projectId}${RESET}`);

  const url = resolveHostingUrl(projectId);
  if (!url) {
    warn('Could not determine hosting URL — skipping smoke test.');
    return;
  }

  const healthy = await smokeTest(url);
  await notifyWebhook(projectId, url, healthy);

  console.log('');
  if (healthy) {
    console.log(`${GREEN}${BOLD}Deploy verified →${RESET} ${url}`);
  } else {
    console.log(`${RED}${BOLD}Deploy verification failed →${RESET} ${url}`);
    process.exitCode = 1;
  }
  console.log('');
}

main().catch((err) => {
  fail(`postdeploy crashed: ${err.stack || err.message}`);
  process.exitCode = 1;
});

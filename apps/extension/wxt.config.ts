import { defineConfig } from 'wxt';

/**
 * The manifest, and why each line of it is there (FR-011, T951).
 *
 * Every permission below is used by code in this repository, and the list is
 * short on purpose: a store review refuses what it cannot see a reason for, and
 * a member reading the install prompt is owed the same honesty.
 *
 * - `sidePanel` — the product surface.
 * - `storage` — tokens, the Botvy address and the cached profile.
 * - `alarms` — the minute heartbeat that wakes an evicted service worker.
 * - `contextMenus` — the four capture entries.
 * - `notifications` — showing an alert Botvy has just sent, so a member at
 *   their desk is not told only on their phone (FR-015).
 * - `identity` — the Google sign-in flow.
 *
 * **No `host_permissions`, and no `scripting`.** The member's Botvy address is
 * a per-browser setting, so the host is requested *at sign-in* through
 * `permissions.request` for that origin alone — a manifest asking for
 * `<all_urls>` up front is both wrong and unreviewable. `scripting` is absent
 * because the selection arrives on the context-menu event, which needs no
 * injection at all.
 *
 * `incognito` is left at its default: the extension is not offered in private
 * windows unless the member turns it on themselves, and if they do it behaves
 * exactly as it does anywhere else — the capture goes to the same Dexie in the
 * same profile — so there is no second path to build or test.
 */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Botvy',
    description: 'One assistant for your day.',
    permissions: [
      'sidePanel',
      'storage',
      'alarms',
      'contextMenus',
      'notifications',
      'identity',
    ],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: 'Botvy' },
    commands: {
      'quick-capture': {
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
        description: 'Capture this page into Botvy',
      },
    },
  },
});

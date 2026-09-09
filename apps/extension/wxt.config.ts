import { defineConfig } from 'wxt';

// The side panel entrypoint (entrypoints/sidepanel/index.html) is what WXT turns
// into manifest.side_panel; the permissions below are the ones P0 needs and no
// more — `identity` for the Google flow that arrives in P1, `contextMenus` for
// the capture entry that arrives with the panel proper.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Botvy',
    description: 'One assistant for your day.',
    permissions: ['sidePanel', 'storage', 'alarms', 'identity', 'contextMenus'],
    action: { default_title: 'Botvy' },
  },
});

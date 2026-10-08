import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every page is static and data comes from the API through /api, so the
// defaults (no incremental cache, no queue) are all this app needs.
export default defineCloudflareConfig();

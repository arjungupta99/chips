/**
 * This folder's own ports (the last its push sink's, `push-sink.mjs`), set before the web suite's config is read: it takes its ports from
 * the environment as it loads, so they must be there first. Apart from the web suite's (4432,
 * 4433, 5174, 5199), the phone suite's (5198) and the walks' (4492, 4592): `lsof` them first, and
 * set the variables to run somewhere else.
 */

const OURS = {
  CHIPS_E2E_WEB_PORT: "5594",
  CHIPS_E2E_BUILD_PORT: "5595",
  CHIPS_E2E_SERVER_PORT: "4792",
  CHIPS_E2E_RELAY_PORT: "4793",
  CHIPS_MOBILE_E2E_PORT: "5596",
  CHIPS_E2E_PUSH_PORT: "5597",
} as const;

for (const [name, port] of Object.entries(OURS)) process.env[name] ??= port;

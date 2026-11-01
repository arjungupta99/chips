import { defineConfig } from "vitest/config";

/**
 * One merged run, one coverage report. Thresholds encode technical-plan 6.3:
 * 90 percent lines and branches on the protocol, the domain layer and the policy
 * engine; 80 percent overall. They may only go up.
 */
export default defineConfig({
  test: {
    projects: [
      "packages/*",
      // The tunnel's own suite, run a second time against `@chipschat/subtle` rather than Node's
      // WebCrypto: the proof that the phone's crypto is the same interface (ADR 0044).
      "packages/subtle/vitest.tunnel.config.ts",
      "apps/*",
      "adapters/*",
      "examples/*",
      "tools/*",
      "server",
      "cli",
      "relay",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "json", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "packages/*/src/**/*.ts",
        "packages/*/src/**/*.tsx",
        "server/src/**/*.ts",
        "cli/src/**/*.ts",
        "relay/src/**/*.ts",
        "adapters/*/src/**/*.ts",
        "apps/web/src/**/*.ts",
        "apps/web/src/**/*.tsx",
        // The phone's `.tsx` is deliberately absent: Vitest cannot host React Native, so every
        // component in `apps/mobile` is tested under Jest (`pnpm mobile:test`) and would report
        // zero here. The pure modules beside them — the tokens, the vocabulary, the pairing
        // payload — are `.ts` and are in this report.
        "apps/mobile/src/**/*.ts",
      ],
      exclude: [
        // Covered by the Playwright suite, not by this one: these are the browser itself — a
        // real WebSocket, IndexedDB, and Ed25519 through WebCrypto. `apps/web/e2e` pairs with a
        // key this code generates, opens the socket it opens, and reloads to read the cache it
        // wrote. Faking them under Node would report a number about the fakes. The code that
        // leans on them — the store, the model, the pending overlay, read state — is in the
        // report and tested directly, the store with a fake transport and cache.
        "apps/web/src/client.ts",
        "apps/web/src/device.ts",
        // The entry point loads the device key and mounts React; the kitchen sink is the design
        // system on a page for the visual suite. Both are Playwright's; the shell is not.
        "apps/web/src/main.tsx",
        "apps/web/src/kitchen-sink/**",
        // The phone's platform seams, for the same reason as the web's above: they are
        // `expo-sqlite`, the Keychain and `expo-crypto`'s native cipher, and a Node fake of any
        // of them would report a number about the fake. The Runtime tab exercises all three on
        // the phone itself and says so in words; the pure modules beside them — the tokens, the
        // pairing payload, base64, the capability checks — are in the report and tested here.
        "apps/mobile/src/device/**",
        "apps/mobile/src/cache/**",
        "apps/mobile/src/runtime/aes.ts",
        "apps/mobile/src/runtime/install.ts",
        "apps/mobile/src/runtime/boot.ts",
        "apps/mobile/src/runtime/platform.ts",
        "apps/mobile/src/runtime/platform.web.ts",
        "apps/mobile/src/prefs.ts",
        "apps/mobile/src/prefs.web.ts",
        // The push seam (M4.3): `expo-notifications` itself, the SQLite queue, and the hooks
        // around them. What they decide is in `push/payload.ts`, which is pure; the queue's own
        // promise is tested through `queue.web.ts`, the same three operations over
        // `localStorage`. Whether a banner appears and a button unlocks is the phone's to
        // answer, and the acceptance walk answers it.
        "apps/mobile/src/push/queue.ts",
        "apps/mobile/src/push/register.ts",
        "apps/mobile/src/push/usePush.ts",
        // The media seams (M4.4): the platform's pickers, its file system and share sheet, the
        // service over them, and the React hook that stages what was picked. What they decide —
        // the name, the kind, and whether the workspace takes a file at all — is in
        // `spaces/picked.ts`, which is pure and in the report; the screens over them are tested
        // under Jest with the seams faked, and the web target's Playwright suite drives the
        // real pickers as file inputs.
        "apps/mobile/src/spaces/pick.ts",
        "apps/mobile/src/spaces/local.ts",
        "apps/mobile/src/spaces/local.web.ts",
        "apps/mobile/src/spaces/files.ts",
        "apps/mobile/src/spaces/useStaged.ts",
        // React Native's, not Node's: the palette hook is `useColorScheme`, and the pairing hook
        // is React state around `pairDevice` and `expo-device`. What either decides is in
        // `pairing/scanned.ts` and `ui/tokens.ts`, which are in the report at 100 percent.
        "apps/mobile/src/ui/theme.ts",
        "apps/mobile/src/ui/useFlag.ts",
        "apps/mobile/src/ui/useNow.ts",
        "apps/mobile/src/ui/useDeepLinks.ts",
        "apps/mobile/src/ui/useAwake.ts",
        "apps/mobile/src/pairing/usePairing.ts",
        // A React hook, tested under Jest (`newSpace/useNamed.test.tsx`), where it can render.
        "apps/mobile/src/newSpace/useNamed.ts",
        "packages/core/src/transport.ts",
        "packages/core/src/cache.ts",
        "packages/core/src/device.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/testing/**",
        "**/*.d.ts",
        "**/index.ts",
        "**/generated/**",
        "**/fixtures/**",
      ],
      thresholds: {
        // 80 percent overall...
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        // ...and 90 on the protocol, the domain layer and the policy engine.
        // These may only go up (technical-plan 6.3).
        "packages/protocol/src/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "server/src/domain/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});

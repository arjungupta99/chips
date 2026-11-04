/**
 * What this phone can do, and how fast, in numbers.
 *
 * It exists for the first run (WP5) and stays for every one after: a phone that pairs but cannot
 * seal a frame, or takes a fifth of a second per signature, is a thing to know before it is a
 * thing a person reports.
 *
 * It is a component rather than a screen because it is reachable two ways. As a tab, once the
 * phone is paired; and as `/runtime`, before it is — which matters, because none of this needs a
 * server, and the moment you most want a diagnostic is the moment pairing has not happened yet.
 *
 * Beyond `checks.ts`, which runs anywhere, some things can only be asked on a phone: whether the
 * Keychain round-trips a key, whether SQLite round-trips a row, whether the phone's native
 * AES-GCM, which seals every relay frame, agrees with the JavaScript one byte for byte, and how
 * much faster it opens a megabyte of frames (`aes.ts`, ADR 0152), and whether its native X25519,
 * Ed25519 and HMAC agree with JavaScript's too (`native.ts`, ADR 0277). Above them it says which
 * of the primitives under `crypto.subtle` run natively here and which in JavaScript.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { thisDevice } from "../device/word";
import { Screen } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE } from "../ui/tokens";
import { type Check, capabilities, responseFromBytes, type Timing, timings } from "./checks";
import { primitives, usingShim } from "./install";
import { platformChecks, platformTimings } from "./platform";

interface Assembled {
  readonly checks: readonly Check[];
  readonly timings: readonly Timing[];
}

export function Report({ back }: { readonly back?: (() => void) | undefined }) {
  const [report, setReport] = useState<Assembled | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const palette = usePalette();

  const run = useCallback(() => {
    setRunning(true);
    void assemble()
      .then((made) => {
        setReport(made);
        say(made);
      })
      .finally(() => setRunning(false));
  }, []);

  useEffect(run, [run]);

  return (
    <Screen title="Runtime">
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.note, { color: palette.ink3 }]}>
          {!usingShim()
            ? "This runtime brought its own crypto.subtle, and it is being used."
            : primitives().every((one) => one.native !== undefined)
              ? `crypto.subtle is @chipschat/subtle (ADR 0044), and every primitive under it is ${thisDevice()}'s own (ADRs 0152, 0277).`
              : "crypto.subtle is @chipschat/subtle (ADR 0044), and what runs each primitive under it is below."}
        </Text>

        {!usingShim() ? null : (
          <View style={styles.group}>
            {primitives().map((one) => (
              <View key={one.name} style={styles.row}>
                <Text style={[styles.name, { color: palette.ink }]}>{one.name}</Text>
                <Text style={[styles.ms, { color: palette.ink2 }]}>
                  {one.native === undefined ? "JavaScript" : `native, ${one.native}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {report === undefined ? (
          <Text style={[styles.note, { color: palette.ink3 }]}>Running…</Text>
        ) : (
          <>
            <View style={styles.group}>
              {report.checks.map((one) => (
                <View key={one.name} style={styles.row}>
                  <Text style={[styles.mark, { color: one.ok ? palette.green : palette.red }]}>
                    {one.ok ? "✓" : "✗"}
                  </Text>
                  <Text style={[styles.name, { color: palette.ink }]}>
                    {one.name}
                    {one.note === undefined ? "" : ` — ${one.note}`}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.group}>
              {report.timings.map((one) => (
                <View key={one.name} style={styles.row}>
                  <Text style={[styles.name, { color: palette.ink }]}>{one.name}</Text>
                  <Text style={[styles.ms, { color: palette.ink2 }]}>{one.ms} ms</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={running}
          onPress={run}
          style={[styles.again, { borderColor: palette.line, opacity: running ? 0.5 : 1 }]}
        >
          <Text style={[styles.againLabel, { color: palette.ink2 }]}>Run again</Text>
        </Pressable>

        {back === undefined ? null : (
          <Pressable accessibilityRole="button" onPress={back}>
            <Text style={[styles.toggle, { color: palette.ink3 }]}>Back to pairing</Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

async function assemble(): Promise<Assembled> {
  const [platform, timed, native] = await Promise.all([
    platformChecks(),
    timings(),
    platformTimings(),
  ]);
  return {
    checks: [...capabilities(), await responseFromBytes(), ...platform],
    timings: [...timed, ...native],
  };
}

/**
 * The report, once, into the Metro terminal.
 *
 * In development a phone's `console.log` travels back over the dev server, so whoever started
 * Metro reads these numbers without the person holding the phone typing anything out. That is
 * the difference between a first run that produces a measurement and one that produces a
 * description of a measurement. Never outside development, where there is nothing listening.
 */
function say(report: Assembled): void {
  if (!__DEV__) return;
  const failed = report.checks.filter((one) => !one.ok).map((one) => `${one.name}: ${one.note}`);
  // biome-ignore lint/suspicious/noConsole: the Metro terminal is the delivery mechanism here.
  console.log(
    `CHIPS RUNTIME REPORT ${JSON.stringify({
      shim: usingShim(),
      javascript: primitives()
        .filter((one) => one.native === undefined)
        .map((one) => one.name),
      failed,
      timings: Object.fromEntries(report.timings.map((one) => [one.name, one.ms])),
    })}`,
  );
}

const styles = StyleSheet.create({
  body: { padding: SPACE.lg, gap: SPACE.lg },
  note: { fontSize: 13, lineHeight: 18 },
  group: { gap: SPACE.xs },
  row: { flexDirection: "row", gap: SPACE.sm, alignItems: "flex-start" },
  mark: { fontSize: 14, width: 16 },
  name: { fontSize: 14, flexShrink: 1 },
  ms: { fontSize: 14, marginLeft: "auto", fontVariant: ["tabular-nums"] },
  again: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACE.md, alignItems: "center" },
  againLabel: { fontSize: 15 },
  toggle: { fontSize: 14, textAlign: "center" },
});

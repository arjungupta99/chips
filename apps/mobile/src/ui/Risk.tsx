/**
 * The risk chips on a decision card: what the policy engine flagged about the action, in the
 * words the design system uses for them.
 *
 * The hot classes — leaving the workspace, money, credentials, destruction — are red; the rest
 * are grey. That division is the vocabulary's, not this file's, so the phone and the desktop
 * agree about which risks are the loud ones.
 */

import { StyleSheet, View } from "react-native";
import { Pill } from "./Pill";
import { SPACE } from "./tokens";
import { RISK, riskLabel } from "./vocabulary";

export function Risk({ classes }: { readonly classes: readonly string[] }) {
  if (classes.length === 0) return null;
  return (
    <View style={styles.row}>
      {classes.map((risk) => (
        <Pill key={risk} tone={RISK[risk]?.hot === true ? "red" : "neutral"}>
          {riskLabel(risk)}
        </Pill>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
});

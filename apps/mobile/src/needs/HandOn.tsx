/**
 * Hand this ask to somebody else (M5.5): a teammate in the space, somebody elsewhere in the
 * workspace, a role, anyone here, or the lane's lead.
 *
 * Being named on an ask is standing enough to answer it, so the list reaches past the space
 * (ADR 0042) — but not to guests: a guest is in one space and answers there. A standing that
 * would reach nobody but the reader is left out (`handChoices`).
 */

import type { HandOnFacts } from "@chipschat/core";
import { handChoices } from "@chipschat/core";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../ui/Button";
import { type Choice, Choices } from "../ui/Choices";
import { Field } from "../ui/Field";
import { SPACE } from "../ui/tokens";

/** Whoever the ask could be handed to, as the form's choices. */
export function candidates(facts: HandOnFacts): readonly Choice[] {
  return handChoices(facts).map((choice) =>
    choice.elsewhere === true ? { ...choice, description: "Not in this space" } : choice,
  );
}

export function HandOn({
  options,
  busy,
  onCancel,
  onHand,
}: {
  readonly options: readonly Choice[];
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onHand: (to: string, reason: string | undefined) => void;
}) {
  const [to, setTo] = useState(options[0]?.value ?? "any");
  const [reason, setReason] = useState("");
  return (
    <View style={styles.form} testID="hand-on">
      <Choices
        label="Hand this to"
        options={options}
        chosen={[to]}
        onChoose={setTo}
        disabled={busy}
      />
      <Field
        label="Why, in a line (optional)"
        value={reason}
        onChange={setReason}
        disabled={busy}
        testID="hand-reason"
      />
      <View style={styles.buttons}>
        <Button label="Cancel" grow onPress={onCancel} disabled={busy} />
        <Button
          label="Hand on"
          variant="primary"
          grow
          busy={busy}
          onPress={() => onHand(to, reason.trim() === "" ? undefined : reason.trim())}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.md },
  buttons: { flexDirection: "row", gap: SPACE.sm },
});

/**
 * Hand this ask to somebody else (M5.5): a teammate in the space, somebody elsewhere in the
 * workspace, a role, anyone here, or the lane's lead.
 *
 * Being named on an ask is standing enough to answer it, so the list reaches past the space
 * (ADR 0042) — but not to guests: a guest is in one space and answers there.
 */

import type { Directory, PersonModel } from "@chipschat/core";
import { nameOf } from "@chipschat/core";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../ui/Button";
import { type Choice, Choices } from "../ui/Choices";
import { Field } from "../ui/Field";
import { SPACE } from "../ui/tokens";

/** The refs that are not a person: what the request's own words allow. */
const STANDING: readonly Choice[] = [
  { value: "role:admin", label: "The admins" },
  { value: "role:owner", label: "The owners" },
  { value: "any", label: "Anyone in the space" },
  { value: "lead", label: "The lane's lead" },
];

export function candidates(
  directory: Directory,
  members: readonly string[],
  people: Readonly<Record<string, PersonModel>>,
  selfId: string,
): readonly Choice[] {
  const here = members.filter((id) => id !== selfId && directory[id]?.kind === "person");
  const elsewhere = Object.values(people)
    .filter(
      (person) =>
        person.role !== "guest" &&
        person.participantId !== selfId &&
        !here.includes(person.participantId),
    )
    .map((person) => person.participantId);
  return [
    ...here.map((id) => ({ value: id, label: nameOf(directory, id) })),
    ...elsewhere.map((id) => ({
      value: id,
      label: people[id]?.displayName ?? nameOf(directory, id),
      description: "Not in this space",
    })),
    ...STANDING,
  ];
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

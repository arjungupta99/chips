/**
 * The top of You (ADR 0085): the person's face, as they chose it on their phone (ADR 0139), the
 * name they go by, edited where it is shown,
 * their role in a line, and signing out of this device; then this computer's appearance.
 */

import { ROLE_SHORT, ROLE_WORDS, type WorkspaceRole } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, Button, type FaceTheme, type Theme } from "@chipschat/ui";
import { useState } from "react";
import { chooseFaces, chooseTheme, storedFaces, storedTheme } from "../appearance.ts";
import { Card, NameField, Row, Segmented } from "./controls.tsx";
import { FaceThemes } from "./FaceThemes.tsx";

export function Profile(props: {
  readonly name: string;
  /** The face you chose on your phone (ADR 0139), when you chose one. */
  readonly face?: SpaceIcon | undefined;
  readonly role: WorkspaceRole | undefined;
  readonly workspace: string;
  /** Inside the desktop app: this device is a computer, not a browser. */
  readonly desktop: boolean;
  readonly rename: (displayName: string) => Promise<void>;
  readonly onSignOut: () => void;
}) {
  const { role } = props;
  return (
    <section className="you-card you-profile" aria-label="Profile" data-testid="profile">
      <Avatar name={props.name} kind="person" size="lg" icon={props.face} />
      <div className="you-profile-t">
        <NameField
          label="Your name"
          name={props.name}
          rename={props.rename}
          className="you-name"
          testId="your-name"
          autoComplete="name"
        />
        <span className="you-role" data-testid="my-role">
          {role === undefined
            ? "Joining…"
            : `${ROLE_WORDS[role]} of ${props.workspace}: ${ROLE_SHORT[role]}`}
        </span>
      </div>
      <Button
        variant="danger"
        className="you-sign-out"
        onClick={props.onSignOut}
        data-testid="sign-out"
      >
        {props.desktop ? "Sign out of this computer" : "Sign out of this browser"}
      </Button>
    </section>
  );
}

const THEME_WORDS = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
] as const satisfies readonly (readonly [Theme, string])[];

/**
 * How this computer looks, in one card, as the phone has it in one group (ADR 0176): light, dark
 * or the system's, and under it the colours the faces wear. Both are this computer's alone; the
 * phone chooses its own.
 */
export function Appearance(props: {
  readonly desktop: boolean;
  /** Who you are, for your own face in the previews. */
  readonly me: { readonly name: string; readonly face: SpaceIcon | undefined };
}) {
  const [theme, setTheme] = useState<Theme>(() => storedTheme());
  const [faces, setFaces] = useState<FaceTheme>(() => storedFaces());
  return (
    <Card label="Appearance" testId="appearance" title="Appearance">
      <Row label="Light or dark" sub={props.desktop ? "This computer only" : "This browser only"}>
        <Segmented
          label="Appearance"
          value={theme}
          options={THEME_WORDS}
          onChange={(chosen) => {
            chooseTheme(chosen);
            setTheme(chosen);
          }}
        />
      </Row>
      <FaceThemes
        chosen={faces}
        onChoose={(chosen) => {
          chooseFaces(chosen);
          setFaces(chosen);
        }}
        me={props.me}
      />
      <p className="you-card-note">
        Soothing and Bright are the colours every face wears: spaces, agents and people.
      </p>
    </Card>
  );
}

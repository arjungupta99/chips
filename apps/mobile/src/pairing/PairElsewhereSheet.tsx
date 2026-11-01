/**
 * The sheet that asks before a pairing link switches the phone to another server (SEC-8), the
 * workspace it was in kept behind the new one (ADR 0197), over
 * whatever was on the screen, as the invite sheet asks before joining another workspace
 * (`pairing/JoinSheet`). Both servers are named; Switch is red and Stay is under it, since a link
 * tapped is exactly how a stranger's server would get a phone to pair with it. The pairing happens
 * only on Switch, and one that fails says why and stays up.
 */

import { useState } from "react";
import { ConfirmBody } from "../spaces/ConfirmSheet";
import { ChipPulse } from "../ui/ChipPulse";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { type Elsewhere, elsewhereAsking, hostOf } from "./elsewhere";
import { Big } from "./JoinCard";

/** What the link asks, and what each answer does. */
export interface ElsewhereAsk extends Elsewhere {
  readonly busy: boolean;
  readonly failed: string | undefined;
  readonly confirm: () => void;
  /** Called once the sheet has gone, whichever way: the ask is over. */
  readonly dismiss: () => void;
}

export function PairElsewhereSheet({ ask }: { readonly ask: ElsewhereAsk }) {
  const palette = usePalette();
  const [open, setOpen] = useState(true);
  const close = () => {
    if (!ask.busy) setOpen(false);
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      closable={!ask.busy}
      onGone={ask.dismiss}
      testID="pair-elsewhere"
    >
      <ConfirmBody
        room={{
          face: (
            <Big scale={1.8}>
              <ChipPulse
                gold={palette.gold}
                ink={palette.ink3}
                lit={palette.ink}
                working={ask.busy}
              />
            </Big>
          ),
          name: hostOf(ask.server),
          last: "The server this link names",
        }}
        confirming={{
          asking: elsewhereAsking(ask, "link"),
          tone: palette.red,
          busy: ask.busy,
          failed: ask.failed,
        }}
        onConfirm={ask.confirm}
        onCancel={close}
        cancel={`Stay in ${ask.workspace}`}
      />
    </Sheet>
  );
}

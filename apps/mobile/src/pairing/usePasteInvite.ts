/**
 * An invite link handed to the app by hand (ADR 0164): pasted from the message it came in, or
 * scanned off somebody's screen. Either opens the join card on it (`app/join.tsx`). What was on
 * the clipboard that is not an invite is said, so a tap that finds a photo, or last week's
 * address, does not seem to do nothing.
 *
 * The clipboard is read on the tap and not before: iOS asks first, and asking before anybody
 * reached for it would be a prompt out of nowhere. Where iOS has its own Paste button (iOS 16 and
 * later), Welcome uses that instead, and iOS asks nothing: the button hands over what was copied
 * (`pasted`).
 */

import { inviteFromLink } from "@chipschat/protocol";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { joinParams } from "./inviteLink";

export const NO_INVITE =
  "There's no Chips invite on the clipboard. Copy the link from the message it came in, then paste it here.";
export const NO_SERVER = "That link doesn't say where its server is. Ask for a new one.";

export interface PasteInvite {
  /** Read the clipboard and open the invite on it. */
  readonly paste: () => void;
  /** Open the invite in what iOS's own Paste button handed over, which asks nothing first. */
  readonly pasted: (text: string) => void;
  /** Open the invite in a scanned code; false when the code is not an invite, to try it as a pairing code. */
  readonly scanned: (text: string) => boolean;
  readonly problem: string | undefined;
}

/**
 * `replace`: the card that opens it stands in for this one (a dead link's "Paste another link").
 * `orPair`: what a pasted line that is not an invite may be instead, a pairing link (ADR 0206):
 * the one an owner sends from a person's page for that person's new phone. True when it was one.
 */
export function usePasteInvite(
  options: { readonly replace?: boolean; readonly orPair?: (text: string) => boolean } = {},
): PasteInvite {
  const router = useRouter();
  const [problem, setProblem] = useState<string | undefined>(undefined);
  // A camera reports the same code many times a second; one card is enough.
  const opened = useRef<string | undefined>(undefined);
  const replace = options.replace === true;
  const { orPair } = options;

  const open = useCallback(
    (text: string): boolean => {
      const link = inviteFromLink(text);
      if (link === undefined) return false;
      if (link.lan === undefined) {
        setProblem(NO_SERVER);
        return true;
      }
      setProblem(undefined);
      if (opened.current === link.token) return true;
      opened.current = link.token;
      const to = { pathname: "/join" as const, params: joinParams(link) };
      if (replace) router.replace(to);
      else router.push(to);
      return true;
    },
    [router, replace],
  );

  const pasted = useCallback(
    (text: string) => {
      // Pasted again after coming back from a card: the same link opens again.
      opened.current = undefined;
      if (open(text)) return;
      if (orPair?.(text) === true) setProblem(undefined);
      else setProblem(NO_INVITE);
    },
    [open, orPair],
  );

  const paste = useCallback(() => {
    void Clipboard.getStringAsync().then(pasted);
  }, [pasted]);

  return { paste, pasted, scanned: open, problem };
}

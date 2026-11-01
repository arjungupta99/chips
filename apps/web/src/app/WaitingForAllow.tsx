/**
 * Waiting for an Allow (ADR 0232), over the whole page, on the web and in Chips for Mac: a link
 * that went out as the relay's page asks the person who sent it, and until they allow it this
 * page shows the six digits their screen shows too. Core keeps the wait (`waitForAllow`); every
 * way of pairing or joining starts one. Built to the mocks' joining screen.
 */

import { allowWaiting, linkWaitingWords, onAllowWaiting } from "@chipschat/core";
import { Button, ChipMark } from "@chipschat/ui";
import { useSyncExternalStore } from "react";

export function WaitingForAllow() {
  const waiting = useSyncExternalStore(onAllowWaiting, allowWaiting);
  if (waiting === undefined) return null;
  const minutes = Math.max(1, Math.round((waiting.expiresAt - Date.now()) / 60_000));
  const words = linkWaitingWords({ ...waiting, minutes });
  return (
    <div
      className="waiting-for-allow"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waiting-for-allow-title"
      data-testid="waiting-for-allow"
    >
      <div className="waiting-for-allow-card">
        <ChipMark size={40} />
        <h2 id="waiting-for-allow-title">{words.title}</h2>
        <p>{words.line}</p>
        <div className="waiting-for-allow-code" data-testid="waiting-code">
          {words.code}
        </div>
        <p className="waiting-for-allow-foot">{words.foot}</p>
        <Button variant="ghost" onClick={waiting.stop}>
          Stop waiting
        </Button>
      </div>
    </div>
  );
}

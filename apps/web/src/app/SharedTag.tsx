/**
 * "Shared", worn by a room somebody besides the reader reads (ADR 0234, `isShared`), as the phone
 * wears it: a person and the word in the palette's violet, which means only this, at the start of
 * a row's second line in the list and beside who is here on the room's details. Shaped as the
 * Main tag is (`styles.css`, `.shared-tag`), so the two sit together on a Main room somebody else
 * is in.
 */

import { Icon } from "@chipschat/ui";

export function SharedTag() {
  return (
    <span className="shared-tag" data-testid="shared-tag">
      <Icon name="user" size={11} />
      shared
    </span>
  );
}

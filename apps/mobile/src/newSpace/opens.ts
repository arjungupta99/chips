import { mayOpenSpace, myRole, type Store } from "@chipschat/core";
import { useSyncExternalStore } from "react";

/**
 * Whether the reader may open a space, and so has the + (ADR 0196): an owner or an admin. Read as
 * a yes or no, so whatever reads it is drawn again only when that changes. Before the people are
 * read it is a yes: the phone's bar hides its slot by remounting the navigator, so the slot is
 * hidden once, for somebody it is known to be no use to, rather than shown again to an owner whose
 * phone has just paired.
 */
export function useOpens(store: Store | undefined, selfId: string | undefined): boolean {
  const read = () => {
    if (store === undefined || selfId === undefined) return true;
    const role = myRole(store.getSnapshot().model, selfId);
    return role === undefined || mayOpenSpace(role);
  };
  return useSyncExternalStore(store?.subscribe ?? still, read, read);
}

/** Nothing to listen to, for a phone with no store yet. */
const still = () => () => undefined;

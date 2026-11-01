/**
 * Messages, as the server finds them, for the Search tab (ADR 0132): core's `messageSearch` —
 * the pause, the newest answer winning, the hits kept between keys, the pages — drawn through
 * `useSyncExternalStore`, and closed when the tab goes.
 *
 * A search that failed because the server could not be reached is asked again when it can be,
 * so a phone that comes back into range finds what was typed without a press.
 */

import { type MessageResults, messageSearch, type Store } from "@chipschat/core";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

export interface MessageSearching {
  readonly results: MessageResults;
  readonly type: (text: string) => void;
  readonly more: () => void;
  readonly retry: () => void;
}

export function useMessageSearch(store: Store, online: boolean): MessageSearching {
  const search = useMemo(() => messageSearch((input) => store.search(input)), [store]);
  useEffect(() => () => search.close(), [search]);
  const results = useSyncExternalStore(search.subscribe, search.results, search.results);
  // Only as the connection comes back: a server that answers and refuses is asked again when the
  // person presses Try again, not in a loop.
  const was = useRef(online);
  useEffect(() => {
    if (online && !was.current) search.retry();
    was.current = online;
  }, [online, search]);
  return { results, type: search.type, more: search.more, retry: search.retry };
}

/**
 * The Search tab (ADR 0132). The screen itself is `src/search/SearchScreen.tsx`; this is the route.
 */

import { SearchScreen } from "../../src/search/SearchScreen";
import { useChips } from "../../src/store/provider";

export default function SearchTab() {
  const { paired } = useChips();
  if (paired === undefined) return null;
  return <SearchScreen store={paired.store} selfId={paired.device.participantId} />;
}

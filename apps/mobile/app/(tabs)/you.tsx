/**
 * The You tab. The screen itself is `src/you/You.tsx`; this is the route.
 */

import { useChips } from "../../src/store/provider";
import { You } from "../../src/you/You";

export default function YouScreen() {
  const { paired } = useChips();
  if (paired === undefined) return null;
  return <You device={paired.device} store={paired.store} />;
}

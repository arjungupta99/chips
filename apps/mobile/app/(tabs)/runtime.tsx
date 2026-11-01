/**
 * Runtime, as a tab, once the phone is paired. Hidden from the tab bar outside development;
 * `app/runtime.tsx` is the same report before pairing has happened.
 */

import { Report } from "../../src/runtime/Report";

export default function RuntimeTab() {
  return <Report />;
}

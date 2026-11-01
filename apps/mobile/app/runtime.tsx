/**
 * Runtime, before there is a workspace.
 *
 * None of what it measures needs a server — the crypto is local, the Keychain and SQLite are
 * this phone's — and pairing needs a code from a computer somebody has to be sitting at. Gating
 * the one screen that says whether this phone can run Chips behind the one step that needs
 * somebody else present is the wrong way round, so this route sits outside the tab group.
 */

import { useRouter } from "expo-router";
import { Report } from "../src/runtime/Report";

export default function RuntimeRoute() {
  const router = useRouter();
  return <Report back={() => router.back()} />;
}

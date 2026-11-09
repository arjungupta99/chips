/**
 * The screens pushed onto the root stack that stand under the platform's navigation bar, said
 * where the stack is made (`app/_layout.tsx`) and nowhere else.
 *
 * Each of them used to turn its bar on itself, with a `<Stack.Screen options={{ headerShown:
 * true }}>` inside it, which reaches the stack one render after the screen has been pushed. On
 * iOS, react-native-screens draws a pushed screen the height of the window and moves its content
 * down by the bar's height, measured when the screen is laid out, and a bar that is still hidden
 * then measures nothing. Most of the time the second render reached the phone first. When it
 * didn't, the content stayed where it would be with no bar, and the bar was drawn over its top:
 * an agent's card with its name under the bar, some of the times it was opened (Arjun, 2 October
 * 2026). Declared here, the bar is there before anything is laid out.
 *
 * A screen still names itself from inside, since only it knows the name; until it has, its bar
 * says nothing rather than the route's file name.
 *
 * A room (`spaces/[id]`) is not here. Over glass its bar floats and holds nothing down, so when it
 * arrives makes no difference; the room measures the bar itself (`app/spaces/[id].tsx`).
 * `ui/bars.vitest.ts` holds every route to this list.
 */
export const UNDER_A_BAR: ReadonlySet<string> = new Set([
  "agents/[id]/index",
  "agents/[id]/history",
  "agents/[id]/permissions",
  "agents/archived",
  "asks",
  "connection",
  "context",
  "harnesses/[id]/[part]",
  "harnesses/[id]/index",
  "harnesses/[id]/jobs/[job]",
  "harnesses/index",
  "invite",
  "media",
  "needs/[id]",
  "people/[id]",
  "people/index",
  "relay",
]);

/**
 * Lines on their way back by Undo (ADR 0165), by id: put here before the store is told, so that
 * the room, drawing the line again, knows it is one coming back. Its row is not given the room's
 * arrival (`useArrivals`, `SpaceView.tsx`) and its bubble starts hidden, to form again from its
 * dust (`Dust.tsx`). The line takes itself off as it is drawn.
 */
export const returning = new Set<string>();

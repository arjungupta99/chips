/**
 * jsdom has no `AnimationEvent`, and without one React listens for the end of an animation by
 * WebKit's old event name, which nothing raises: the new-space dialog goes when its fade ends,
 * and a test says it has ended with `fireEvent.animationEnd`. Only the name is needed, and it is
 * needed before React DOM is loaded, which looks once (`setup.ts` imports this first).
 */
if (typeof globalThis.AnimationEvent === "undefined") {
  globalThis.AnimationEvent =
    class AnimationEvent extends Event {} as unknown as typeof AnimationEvent;
}

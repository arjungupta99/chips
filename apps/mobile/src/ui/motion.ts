/**
 * The spring everything the app moves itself moves on: the ratio and the response UIKit gives
 * its own transitions (a damping ratio of 0.85 at a 0.35 s response), which is what a phone's
 * hand expects — a timing curve, however well eased, arrives like a slide from a deck (ADR 0050).
 * One object, spread into `Animated.spring`, so a line landing, the thinking bubble and a sheet
 * rising all settle the same way.
 */
export const IOS_SPRING = { stiffness: 320, damping: 32, mass: 1 } as const;

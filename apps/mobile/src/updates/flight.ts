/**
 * The phone's one flight of the update dot into About's first update button (ADR 0296, addendum
 * of 17 November 2026): core's store (`dotFlights`), kept for the whole app, and a hook that draws
 * again as it changes.
 */

import { type DotFlight, dotFlights } from "@chipschat/core";
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";

export const flights = dotFlights();

/** Whether this phone draws the flight: the layer it is drawn on is iOS's (`DotFlight`). */
export const FLIES = Platform.OS === "ios";

export function useDotFlight(): DotFlight {
  return useSyncExternalStore(flights.subscribe, flights.now, flights.now);
}

/**
 * For About's Updates group: with no update button to land on, a dot on its way goes out where it
 * stands at once, rather than after the wait.
 */
export function useMissWithoutButton(buttons: boolean): void {
  const flight = useDotFlight();
  useEffect(() => {
    if (!buttons && flight.stage === "up") flights.miss(flight.id);
  }, [buttons, flight.stage, flight.id]);
}

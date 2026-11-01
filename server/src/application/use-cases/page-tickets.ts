/**
 * Single-use tickets for loading an HTML page into a frame (ADR 0201): one instance of
 * `createTickets`, holding who asked and which attachment they asked for, or the page of a room's
 * project built for them (ADR 0223).
 *
 * The frame on the Mac and the web cannot sign the request for its document, and a frame given
 * its document takes the app's own policy with it, which runs no inline script. So the view makes
 * one signed request — `POST /v1/attachments/:id/page` — and loads `/v1/pages/<ticket>`, whose
 * answer carries the page's own policy as a header and spends the ticket.
 *
 * A project page's ticket holds the whole built document until it is spent or runs out, so one
 * person holds only so many unspent at once (SEC-53). A view asks for one ticket as it opens and
 * spends it at once; the cap is far past what opening pages by hand comes to.
 */

import type { Principal } from "../ports/identity.js";
import { createTickets, type Ticket, type Tickets, type TicketsDeps } from "./tickets.js";

/** Long enough for the frame to load, which it does at once, and too short to keep. */
export const PAGE_TICKET_TTL_SECONDS = 30;

/** How many page tickets one person may hold unspent at once. */
export const MAX_UNSPENT_PAGE_TICKETS = 32;

export type PageTicket =
  | {
      /** Who asked: the person the page is served as, asked again at the door whether they may read it. */
      readonly principal: Principal;
      readonly attachmentId: string;
    }
  | {
      readonly principal: Principal;
      /**
       * A page of a room's project, built into one document when the ticket was asked for (ADR
       * 0223): the person was asked then whether they may read it, and the ticket is theirs alone
       * for thirty seconds.
       */
      readonly built: { readonly spaceId: string; readonly path: string; readonly html: string };
    };

export interface PageTickets extends Omit<Tickets<PageTicket>, "issue"> {
  /** Mint a ticket, or nothing while the person asking holds as many unspent as they may. */
  readonly issue: (held: PageTicket) => Ticket | undefined;
}

export type PageTicketsDeps = Omit<TicketsDeps, "ttlSeconds">;

export function createPageTickets(deps: PageTicketsDeps): PageTickets {
  const tickets = createTickets<PageTicket>({ ...deps, ttlSeconds: PAGE_TICKET_TTL_SECONDS });
  return {
    ...tickets,
    issue(held) {
      const who = held.principal.participantId;
      const unspent = tickets.count((each) => each.principal.participantId === who);
      return unspent >= MAX_UNSPENT_PAGE_TICKETS ? undefined : tickets.issue(held);
    },
  };
}

/**
 * The web target keeps core's browser storage: IndexedDB holds a `CryptoKey` the page itself
 * cannot read, which is stronger than anything this app can arrange on a phone, and needs
 * neither `keepKey` nor `loadKey`.
 */

export { browserStorage as deviceStorage } from "@chipschat/core";

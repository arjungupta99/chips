import { describe, expect, it } from "vitest";
import { routeFor, routerPathFor } from "./links";

/**
 * A link from outside is untrusted input: it arrives from a push tap, a message, a browser, or
 * somebody's clipboard. What it must never do is send the app somewhere it should not be, so
 * every shape that is not one of the two is nothing at all rather than a best guess.
 */
describe("where a chips:// link goes", () => {
  it("opens a space and an ask", () => {
    expect(routeFor("chips://space/spc_01H")).toBe("/spaces/spc_01H");
    expect(routeFor("chips://approval/apr_01H")).toBe("/needs/apr_01H");
  });

  it("is lenient about the slashes, as the desktop is", () => {
    expect(routeFor("chips:space/spc_01H")).toBe("/spaces/spc_01H");
  });

  it("takes the Expo Go shape, where there is no custom scheme to have", () => {
    expect(routeFor("exp://100.64.0.7:8081/--/space/spc_01H")).toBe("/spaces/spc_01H");
    expect(routeFor("exp://127.0.0.1:8081/--/approval/apr_01H")).toBe("/needs/apr_01H");
  });

  it("refuses another scheme, another kind, and an id of the wrong sort", () => {
    expect(routeFor("https://chipschat.ai/space/spc_01H")).toBeUndefined();
    expect(routeFor("chips://nonsense/xyz")).toBeUndefined();
    expect(routeFor("chips://space/apr_01H")).toBeUndefined();
    expect(routeFor("chips://approval/spc_01H")).toBeUndefined();
  });

  it("refuses a link with nothing to open, and one that is not a URL at all", () => {
    expect(routeFor("chips://space")).toBeUndefined();
    expect(routeFor("chips://")).toBeUndefined();
    expect(routeFor("not a url")).toBeUndefined();
    expect(routeFor("")).toBeUndefined();
  });

  it("refuses a path dressed up to escape the two routes", () => {
    // `URL` normalises the `..` away, so what is left is checked like anything else: the kind
    // must be one of two and the id must carry its prefix. Neither survives.
    expect(routeFor("chips://space/../../etc")).toBeUndefined();
    expect(routeFor("chips://space/spc_1/../../needs/apr_2")).toBeUndefined();
    expect(routeFor("exp://127.0.0.1:8081/--/../space/spc_1")).toBeUndefined();
  });
});

describe("what the router is given of a link the app is opened with", () => {
  it("is nothing for a space or an ask, which useDeepLinks opens once there is a store", () => {
    expect(routerPathFor("chips://space/spc_01H")).toBeNull();
    expect(routerPathFor("chips://approval/apr_01H")).toBeNull();
  });

  it("is /join for an invite at the relay's page, with the invite from its fragment", () => {
    expect(
      routerPathFor("https://relay.chipschat.ai/join#invite=chips_inv_1&lan=http%3A%2F%2Fa"),
    ).toBe("/join?invite=chips_inv_1&lan=http%3A%2F%2Fa");
  });

  it("is the link as it came for anything else", () => {
    expect(routerPathFor("chips://you")).toBe("chips://you");
    expect(routerPathFor("chips://join?invite=chips_inv_1")).toBe(
      "chips://join?invite=chips_inv_1",
    );
    expect(routerPathFor("chips://space/apr_01H")).toBe("chips://space/apr_01H");
  });
});

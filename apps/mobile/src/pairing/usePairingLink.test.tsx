/**
 * A pairing link on a phone that is paired already. One naming another server is not followed on
 * its own (SEC-8): the hook hands the ask back; Switch pairs, Stay steps off the pairing screen
 * the link opened. One naming the server held is a no-op that steps off that screen, every time
 * it is opened.
 */

import { pairDevice } from "@chipschat/core";
import { act, renderHook } from "@testing-library/react-native";
import { usePairingNow } from "./PairingNow";
import { usePairingLink } from "./usePairingLink";

const mockRouter = { replace: jest.fn(), push: jest.fn() };
let mockUrl: string | null = null;
const mockOpenings = new Set<(event: { url: string }) => void>();
/** A link handed to the running app, as iOS hands one on "Open in Chips?". */
const mockOpen = (url: string) => {
  mockUrl = url;
  for (const on of mockOpenings) on({ url });
};
let mockPathname = "/";
const mockBegan = jest.fn();
const mockPaired = {
  device: { serverUrl: "http://192.168.1.20:4431", workspaceName: "Home" },
  store: { getSnapshot: () => ({ connection: "open" }), subscribe: () => () => undefined },
};
jest.mock("expo-linking", () => ({
  getLinkingURL: () => mockUrl,
  addEventListener: (_type: "url", on: (event: { url: string }) => void) => {
    mockOpenings.add(on);
    return { remove: () => mockOpenings.delete(on) };
  },
}));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => mockPathname }));
/** The workspace this phone holds: `mockPaired`, or none on a phone just installed. */
let mockHeld: typeof mockPaired | undefined = mockPaired;
jest.mock("../store/provider", () => ({
  deviceStorage: {},
  useChips: () => ({
    ready: true,
    paired: mockHeld,
    devices: [],
    began: mockBegan,
    switchTo: async () => {},
  }),
}));
jest.mock("./usePairing", () => ({ phoneName: () => "iPhone 17 Pro" }));
jest.mock("@chipschat/core", () => ({
  pairDevice: jest.fn(),
  workspaceLabel: (device: { workspaceName?: string }) => device.workspaceName ?? "?",
  // A code that asks would wait here (ADR 0232); these links pair at once.
  waitForAllow: () => ({ onWaiting: () => undefined, done: () => undefined }),
}));

const ELSEWHERE = "chips://pair?pair=ABC-234&v=1&lan=http%3A%2F%2F192.168.1.99%3A4431";
/** A link for the server the phone holds: `pnpm phone`'s, or the QR's address opened twice. */
const HELD = "chips://pair?pair=ABC-234&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431";

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = "/pair";
  mockHeld = mockPaired;
});

it("says over the screen which Chips it is pairing with while it does (Part 2, item 4)", async () => {
  mockHeld = undefined;
  mockUrl = "https://chipschat.ai/p#pair=ABC-234&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431";
  let answer: (device: unknown) => void = () => undefined;
  jest.mocked(pairDevice).mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve as (device: unknown) => void;
      }),
  );
  const now = await renderHook(() => usePairingNow());
  await renderHook(() => usePairingLink());
  expect(now.result.current).toBe("192.168.1.20:4431");
  await act(async () => answer({ deviceId: "dev_1" }));
  expect(now.result.current).toBeUndefined();
  expect(mockBegan).toHaveBeenCalledWith({ deviceId: "dev_1" });
});

it("asks before a link pairs the phone with another server, and pairs on Switch", async () => {
  mockUrl = ELSEWHERE;
  const device = { deviceId: "dev_2" };
  jest.mocked(pairDevice).mockResolvedValue(device as never);
  const { result } = await renderHook(() => usePairingLink());
  await act(async () => undefined);
  // Nothing was paired: the ask names both servers instead.
  expect(pairDevice).not.toHaveBeenCalled();
  expect(result.current).toMatchObject({
    server: "http://192.168.1.99:4431",
    heldServer: "http://192.168.1.20:4431",
    workspace: "Home",
    busy: false,
  });

  await act(async () => result.current?.confirm());
  // The offer itself goes along, for the key and the relay it may carry (none here).
  expect(pairDevice).toHaveBeenCalledWith(
    "ABC-234",
    "iPhone 17 Pro",
    "http://192.168.1.99:4431",
    { ok: true, code: "ABC-234", lan: "http://192.168.1.99:4431" },
    {},
    expect.objectContaining({ onWaiting: expect.any(Function) }),
  );
  expect(mockBegan).toHaveBeenCalledWith(device);
  expect(mockRouter.replace).toHaveBeenCalledWith("/");
  expect(result.current).toBeUndefined();
});

it("pairs nothing when the person stays, and steps off the pairing screen the link opened", async () => {
  mockUrl = `${ELSEWHERE}&stay=1`;
  const { result } = await renderHook(() => usePairingLink());
  await act(async () => undefined);
  expect(result.current).toBeDefined();
  await act(async () => result.current?.dismiss());
  expect(pairDevice).not.toHaveBeenCalled();
  expect(mockBegan).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith("/");
  expect(result.current).toBeUndefined();
});

it("steps off the pairing screen every time a link for the server it holds is opened", async () => {
  // The phone holds a key the server takes (`connection: "open"`), so the link mints no second
  // key, and the pairing screen the router opened on it is stepped off. Opened again — the same
  // link, its code spent by now — the router opens that screen again, so the step-off has to
  // come again. Kept as the latest URL, a link opened twice was the same string, which is not
  // a change, and Welcome stayed over the paired phone (ADR 0191's walks, 18 October 2026).
  mockUrl = HELD;
  const { result } = await renderHook(() => usePairingLink());
  await act(async () => undefined);
  expect(pairDevice).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);

  await act(async () => mockOpen(HELD));
  expect(pairDevice).not.toHaveBeenCalled();
  expect(result.current).toBeUndefined();
  expect(mockRouter.replace).toHaveBeenCalledTimes(2);
  expect(mockRouter.replace).toHaveBeenLastCalledWith("/");
});

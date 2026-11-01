/**
 * Which builds look for Chips on the Wi-Fi (ADR 0172, AN-27): iOS and Android, each through the
 * app's own module, and nothing where there is none.
 */

const mockModule = jest.fn();
jest.mock("expo", () => ({ requireOptionalNativeModule: (name: string) => mockModule(name) }));

function finderOn(os: string) {
  jest.resetModules();
  jest.doMock("react-native", () => ({ Platform: { OS: os } }));
  return require("./finder") as typeof import("./finder");
}

beforeEach(() => mockModule.mockReset());

it("looks on Android too, through the same module, and answers in the same shape", async () => {
  mockModule.mockReturnValue({
    find: async () => [
      { name: "Chips on mini", host: "192.168.1.20", port: 4431, machine: "", workspace: "ws_1" },
    ],
  });
  const finder = finderOn("android");
  expect(finder.canFind()).toBe(true);
  expect(mockModule).toHaveBeenCalledWith("ChipsFinder");
  expect(await finder.findServers()).toEqual([
    { name: "mini", url: "http://192.168.1.20:4431", workspaceId: "ws_1" },
  ]);
});

it("does not look where the build has no module, or on the web", () => {
  mockModule.mockReturnValue(null);
  expect(finderOn("android").canFind()).toBe(false);
  mockModule.mockReturnValue({ find: async () => [] });
  expect(finderOn("web").canFind()).toBe(false);
});

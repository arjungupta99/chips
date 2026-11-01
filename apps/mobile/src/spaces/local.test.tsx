/**
 * Where a file the person taps is shown (ADR 0124): in Quick Look, where this build has it and it
 * can draw the file; on Android, in the app it has for the file's kind; and in the share sheet
 * otherwise, as every file was before. Whichever it is, the file leaves under the name it was sent
 * with, not the name the phone keeps it by. The disk is a fake here, holding copies.
 */

import { startActivityAsync } from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { previewBytes, previewLocally } from "./local";
import { quickLook } from "./quickLook";

const mockCopies: string[] = [];

jest.mock("expo-file-system", () => {
  const uriOf = (at: unknown, name?: string) =>
    name === undefined ? String(at) : `${(at as { uri: string }).uri}/${name}`;
  class Directory {
    readonly uri: string;
    constructor(at: unknown, name?: string) {
      this.uri = uriOf(at, name);
    }
    exists = false;
    delete() {}
    create() {}
  }
  class File {
    readonly uri: string;
    constructor(at: unknown, name?: string) {
      this.uri = uriOf(at, name);
    }
    get contentUri() {
      return this.uri.replace("file:///cache", "content://chat.chips.app.FileSystemFileProvider");
    }
    copy(to: File) {
      mockCopies.push(to.uri);
    }
    write() {
      mockCopies.push(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: { uri: "file:///cache" } } };
});
jest.mock("expo-intent-launcher", () => ({ startActivityAsync: jest.fn(async () => undefined) }));
jest.mock("./quickLook", () => ({ quickLook: jest.fn() }));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const PDF = "file:///cache/attachments/att_1-brief_notes.pdf";
const LEAVING = "file:///cache/leaving/brief notes.pdf";

describe("showing a kept file", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCopies.length = 0;
  });

  it("shows it in Quick Look under its own name, where Quick Look can draw it", async () => {
    const preview = jest.fn(async () => undefined);
    jest.mocked(quickLook).mockReturnValue({ canPreview: () => true, preview });
    await previewLocally(PDF, "brief notes.pdf", "application/pdf");
    expect(preview).toHaveBeenCalledWith(LEAVING, "brief notes.pdf");
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("hands a file Quick Look cannot draw to the share sheet", async () => {
    const preview = jest.fn(async () => undefined);
    jest.mocked(quickLook).mockReturnValue({ canPreview: () => false, preview });
    await previewLocally(PDF, "brief notes.pdf", "application/pdf");
    expect(preview).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith(LEAVING, {
      mimeType: "application/pdf",
      dialogTitle: "brief notes.pdf",
    });
  });

  it("hands it to the share sheet on a build without Quick Look, as before", async () => {
    jest.mocked(quickLook).mockReturnValue(undefined);
    await previewLocally(PDF, "brief notes.pdf", "application/pdf");
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });

  it("on Android, opens it in the app Android has for its kind, which may read that file alone", async () => {
    jest.mocked(quickLook).mockReturnValue(undefined);
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      await previewLocally(PDF, "brief notes.pdf", "application/pdf");
      expect(startActivityAsync).toHaveBeenCalledWith("android.intent.action.VIEW", {
        data: "content://chat.chips.app.FileSystemFileProvider/leaving/brief notes.pdf",
        type: "application/pdf",
        flags: 1,
      });
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    } finally {
      android.restore();
    }
  });

  it("on Android, hands it to the share sheet when no app there opens its kind", async () => {
    jest.mocked(quickLook).mockReturnValue(undefined);
    jest.mocked(startActivityAsync).mockRejectedValueOnce(new Error("No Activity found"));
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      await previewLocally(PDF, "brief notes.pdf", "application/pdf");
      expect(Sharing.shareAsync).toHaveBeenCalledWith(LEAVING, {
        mimeType: "application/pdf",
        dialogTitle: "brief notes.pdf",
      });
    } finally {
      android.restore();
    }
  });

  it("copies the file out under its sent name, and leaves the kept file as it is", async () => {
    jest.mocked(quickLook).mockReturnValue(undefined);
    await previewLocally(PDF, "brief notes.pdf", "application/pdf");
    expect(mockCopies).toEqual([LEAVING]);
  });

  it("writes a document of the room's project under its name, and shows it in Quick Look (ADR 0227)", async () => {
    const preview = jest.fn(async () => undefined);
    jest.mocked(quickLook).mockReturnValue({ canPreview: () => true, preview });
    await previewBytes(new Uint8Array([0x25, 0x50]), "supply-chain.pdf", "application/pdf");
    expect(mockCopies).toContain("file:///cache/looking/supply-chain.pdf");
    expect(preview).toHaveBeenCalledWith(
      "file:///cache/leaving/supply-chain.pdf",
      "supply-chain.pdf",
    );
  });
});

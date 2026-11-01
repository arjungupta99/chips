/**
 * What the phone already keeps, found before anything is fetched (ADR 0161): read from the disk the
 * first time it is asked, kept in step as files are kept and let go, and never a file the system
 * took from the cache meanwhile. The disk is a fake here, holding names.
 */

const mockDisk = new Map<string, number>();

jest.mock("expo-file-system", () => {
  const DIR = "file:///cache/attachments/";
  class File {
    readonly uri: string;
    readonly name: string;
    constructor(at: unknown, name?: string) {
      this.name = name ?? String(at).slice(DIR.length);
      this.uri = `${DIR}${this.name}`;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    get size() {
      return mockDisk.get(this.name) ?? 0;
    }
    write(bytes: Uint8Array) {
      mockDisk.set(this.name, bytes.length);
    }
    delete() {
      mockDisk.delete(this.name);
    }
  }
  class Directory {
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [...mockDisk.keys()].map((name) => new File(undefined, name));
    }
  }
  return { File, Directory, Paths: { cache: {} } };
});
jest.mock("./quickLook", () => ({ quickLook: () => undefined }));

type Local = typeof import("./local");

/** A fresh module, as a new process has: nothing read from the disk yet. */
function fresh(): Local {
  let local: Local | undefined;
  jest.isolateModules(() => {
    local = require("./local");
  });
  return local as Local;
}

const at = (name: string) => `file:///cache/attachments/${name}`;

beforeEach(() => mockDisk.clear());

describe("what the phone already keeps", () => {
  it("is found from what an earlier process kept, and from what this one keeps", async () => {
    mockDisk.set("att_1-thumb-thumb.webp", 20);
    mockDisk.set("att_1-receipt.jpg", 900);
    const local = fresh();
    expect(local.findKept("att_1", "thumb")).toBe(at("att_1-thumb-thumb.webp"));
    expect(local.findKept("att_1", "file")).toBe(at("att_1-receipt.jpg"));
    expect(local.findKept("att_1", "view")).toBeUndefined();
    await local.keepLocally("att_1-view", "view.webp", "image/webp", new Uint8Array(3));
    expect(local.findKept("att_1", "view")).toBe(at("att_1-view-view.webp"));
    expect(local.findKept("att_2", "thumb")).toBeUndefined();
  });

  it("forgets what was let go, all of it on Clear all, and a file the system took meanwhile", async () => {
    mockDisk.set("att_1-thumb-thumb.webp", 20);
    mockDisk.set("att_2-thumb-thumb.webp", 20);
    mockDisk.set("att_3-thumb-thumb.webp", 20);
    const local = fresh();
    await local.forgetKept(["att_1"]);
    expect(local.findKept("att_1", "thumb")).toBeUndefined();
    mockDisk.delete("att_2-thumb-thumb.webp");
    expect(local.findKept("att_2", "thumb")).toBeUndefined();
    expect(local.findKept("att_3", "thumb")).toBe(at("att_3-thumb-thumb.webp"));
    await local.clearKept();
    expect(local.findKept("att_3", "thumb")).toBeUndefined();
  });

  it("plays a video's MP4 copy over an original kept while the copy was being made", () => {
    mockDisk.set("att_clip-play-IMG_4410.MOV", 900);
    mockDisk.set("att_clip-play-IMG_4410.mp4", 400);
    expect(fresh().findKept("att_clip", "play")).toBe(at("att_clip-play-IMG_4410.mp4"));
  });
});

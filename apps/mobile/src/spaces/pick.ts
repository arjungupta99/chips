/**
 * Where a file comes from on a phone: the photo library, the camera, or the Files app. Each is
 * the platform's own picker — the sheet iOS shows for photos needs no permission of its own —
 * and what comes back is one shape, whichever it was, so the composer stages a photo and a PDF
 * the same way.
 *
 * A picker the person backed out of is an empty list. One that could not open — no camera on
 * this device, or the camera refused in Settings — is a sentence for the composer to show,
 * because a button that does nothing is the worst of the three outcomes.
 */

import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { fromAsset, mimeFromName, type Picked } from "./picked";

export type { Picked } from "./picked";

export type Source = "library" | "camera" | "files";

export type Picking = { readonly picked: readonly Picked[] } | { readonly refused: string };

/** Up to this many at once; the composer is a row of chips, not a gallery. */
const MOST_AT_ONCE = 10;

const MEDIA: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images", "videos"],
  quality: 1,
  exif: false,
  // A JPEG for a HEIC and H.264 for HEVC: the most compatible representation, so what reaches
  // the desktop and the harness is something they can open.
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

async function fromLibrary(): Promise<Picking> {
  const result = await ImagePicker.launchImageLibraryAsync({
    ...MEDIA,
    allowsMultipleSelection: true,
    selectionLimit: MOST_AT_ONCE,
    orderedSelection: true,
  });
  return { picked: result.canceled ? [] : result.assets.map(fromAsset) };
}

async function fromCamera(): Promise<Picking> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return {
      refused:
        "Chips may not use the camera. Allow it in Settings, or send a photo from your library.",
    };
  }
  const result = await ImagePicker.launchCameraAsync(MEDIA);
  return { picked: result.canceled ? [] : result.assets.map(fromAsset) };
}

async function fromFiles(): Promise<Picking> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { picked: [] };
  return {
    picked: result.assets.slice(0, MOST_AT_ONCE).map((asset) => ({
      name: asset.name,
      mimeType: asset.mimeType ?? mimeFromName(asset.name),
      size: asset.size,
      uri: asset.uri,
    })),
  };
}

/** Open the picker for a source, and say what it gave. */
export async function pick(source: Source): Promise<Picking> {
  try {
    if (source === "library") return await fromLibrary();
    if (source === "camera") return await fromCamera();
    return await fromFiles();
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    if (source === "camera") return { refused: `The camera is not available here: ${why}` };
    return { refused: `Could not open the picker: ${why}` };
  }
}

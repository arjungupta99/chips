/**
 * A thumbnail's object URL, once it is there. The file service caches them for the page's life,
 * so a strip of twenty asks for each once however many times the viewer redraws.
 */

import { useEffect, useState } from "react";
import type { FileService } from "../files.ts";

export function useThumb(files: FileService, id: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    files.thumb(id).then(
      (found) => {
        if (live) setUrl(found);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [files, id]);
  return url;
}

import { useEffect, useState } from "react";

/**
 * A yes or no asked once a render needs it, such as whether Run is this person's on this Mac
 * (ADR 0231): no until it says yes, and no when there is nobody to ask or the asking fails.
 */
export function useYes(ask: (() => Promise<boolean>) | undefined): boolean {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    if (ask === undefined) return setYes(false);
    let live = true;
    void ask().then(
      (said) => live && setYes(said),
      () => live && setYes(false),
    );
    return () => {
      live = false;
    };
  }, [ask]);
  return yes;
}

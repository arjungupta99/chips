import { segments } from "@chipschat/core";
import { Fragment } from "react";

/** Words with stretches in code, as core marks them with backticks. */
export function Coded(props: { readonly text: string }) {
  return (
    <>
      {segments(props.text).map((part, at) =>
        part.code === true ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a stretch's place is its order.
          <code key={at}>{part.text}</code>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above.
          <Fragment key={at}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

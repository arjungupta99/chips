/**
 * An agent's face, chosen on a page of its own over its card (ADR 0272), as the phone's card opens
 * its face sheet from the face and the Icon row (ADR 0089, 0174): the picker with the agent at its
 * head and its harness under it. Arjun, 3 November 2026: "I want us to minimise popups in ipad,
 * mac and web where possible." It is one face for everybody who sees the agent.
 *
 * A pick the server turns away puts the old face back (the store does that) and says why at the
 * top of the page, rather than looking as if the click did nothing.
 */

import { type Directory, harnessOf, nameOf, whyFaceNotSaved } from "@chipschat/core";
import { useState } from "react";
import { FacePicker } from "../face/FacePicker.tsx";
import type { AgentsService } from "./service.ts";

export function AgentFace(props: {
  readonly agentId: string;
  readonly directory: Directory;
  readonly agents: AgentsService;
}) {
  const { agentId, directory } = props;
  const [failed, setFailed] = useState<string | undefined>(undefined);
  return (
    <FacePicker
      title={nameOf(directory, agentId)}
      subtitle={nameOf(directory, harnessOf(directory, agentId))}
      kind="agent"
      chosen={directory[agentId]?.face}
      failed={failed}
      testId="agent-face-picker"
      onChoose={(face) => {
        setFailed(undefined);
        void props.agents
          .face(agentId, face)
          .catch((error: unknown) => setFailed(whyFaceNotSaved(error)));
      }}
    />
  );
}

/**
 * Universe on the Mac and in a browser (ADR 0227): what the space made, opened from the four rings
 * at the room's head. It is the phone's Desktop tab, acting here:
 *
 * - On the Mac, Your folder (ADR 0224): Open folder, Open in editor, what came in; under it
 *   Documents, whose Open page opens the start page, or the one document, in this window; and
 *   Programs, Run program, which runs it on this Mac and never in Chips (ADR 0226).
 * - In a browser, Open folder in Mac and Run program ask the person's Mac (ADRs 0225, 0226), and
 *   Open page opens the page here.
 *
 * What the space has is core's `universeOf`, read again as the project moves on.
 */

import {
  noStartPageWords,
  type RecipeRead,
  type Space,
  startName,
  startOf,
  type Universe,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { type ReactNode, useState } from "react";
import type { FileService } from "../files.ts";
import { PageDialog } from "../PageView.tsx";
import { type ProjectActions, useFolders, useRead } from "./Project.tsx";
import { ProjectDocument } from "./ProjectDocument.tsx";
import { Back, Chev, Failed, Group, Heading, Row, Tile } from "./parts.tsx";
import { AwayRun } from "./RunBar.tsx";
import { UniverseMark, UniverseReading } from "./UniverseMark.tsx";
import { useYes } from "./useYes.ts";
import { FolderOnMac, YourFolder } from "./YourFolder.tsx";

type UniverseProps = {
  readonly titleId: string;
  readonly space: Space;
  /** The room's name, which its folder is named for. */
  readonly title: string;
  readonly project: ProjectActions;
  /** How this client's files are fetched and its pages held: the Mac shell's door (ADR 0223). */
  readonly files?: FileService | undefined;
  readonly onBack: () => void;
};

/** Universe, where this client reads the room's project; nothing where it doesn't. */
export function UniversePage(
  props: Omit<UniverseProps, "project"> & { readonly project: ProjectActions | undefined },
) {
  const { project } = props;
  return project === undefined ? null : <UniverseOf {...props} project={project} />;
}

function UniverseOf(props: UniverseProps) {
  const { space, project } = props;
  const head = space.project?.changes[0]?.commit ?? "";
  const read = useRead(() => project.universe(), `${space.id}:${head}`, true);
  const folders = useFolders(project.folders);
  const [open, setOpen] = useState<string | undefined>(undefined);
  const universe = read.value;
  const documents =
    universe?.documents === undefined ? null : (
      <Documents documents={universe.documents} onOpen={setOpen} />
    );
  return (
    <>
      <Back titleId={props.titleId} title="Universe" onBack={props.onBack} testId="universe-back" />
      <div className="sheet-scroll universe" data-testid="universe">
        <p className="universe-under">
          <UniverseMark size={18} />
          {props.title}
        </p>
        {read.failed !== undefined && <Failed words={read.failed} />}
        {universe === undefined && read.failed === undefined && (
          <UniverseReading words="Reading the space…" />
        )}
        {universe !== undefined && (
          // What it read arrives where the planets went round: it fades in and rises into place.
          <div className="universe-came">
            <Here
              room={{ id: space.id, title: props.title }}
              project={project}
              folders={folders}
              program={programOf(universe)}
            >
              {documents}
            </Here>
            {universe.documents === undefined && programOf(universe) === undefined && (
              <p className="sheet-hint">Nothing here opens yet.</p>
            )}
          </div>
        )}
      </div>
      {open !== undefined && (
        <ProjectDocument
          path={open}
          project={project}
          files={props.files}
          onFile={setOpen}
          onClose={() => setOpen(undefined)}
        />
      )}
    </>
  );
}

/** What Programs shows: the program, or what is wrong with the run file. */
function programOf(universe: Universe): RecipeRead {
  return universe.program ?? (universe.why === undefined ? undefined : { why: universe.why });
}

/**
 * The folder and Programs, where this client has them: the Mac's own, a browser asking the Mac, or,
 * in a Mac app that carries no `chips`, the documents alone.
 */
function Here(props: {
  readonly room: { readonly id: string; readonly title: string };
  readonly project: ProjectActions;
  readonly folders: boolean | undefined;
  readonly program: RecipeRead;
  readonly children: ReactNode;
}) {
  const { project, program } = props;
  // From a browser, the Mac is asked only by an owner (ADR 0231).
  const mine = useYes(project.onTheMac);
  if (props.folders === true && project.folders !== undefined) {
    return (
      <YourFolder
        room={props.room}
        folders={project.folders}
        program={program}
        changedSince={project.changedSince}
        sends={project.sends?.() ?? true}
      >
        {props.children}
      </YourFolder>
    );
  }
  if (project.openOnMac !== undefined && mine) {
    return (
      <FolderOnMac openOnMac={project.openOnMac}>
        {props.children}
        {program !== undefined && project.runs !== undefined && (
          <>
            <Heading>Programs</Heading>
            <AwayRun runs={project.runs} recipe={program} changedSince={project.changedSince} />
          </>
        )}
      </FolderOnMac>
    );
  }
  return props.folders === undefined ? null : <>{props.children}</>;
}

/** Documents: Open page for the start page or the one document; several without one, listed. */
function Documents(props: {
  readonly documents: NonNullable<Universe["documents"]>;
  readonly onOpen: (path: string) => void;
}) {
  const { documents, onOpen } = props;
  return (
    <section className="universe-documents" data-testid="universe-documents">
      <Heading>Documents</Heading>
      {"start" in documents ? (
        <>
          <button
            type="button"
            className="sheet-go"
            onClick={() => onOpen(documents.start)}
            data-testid="universe-open-page"
          >
            <Icon name="doc" size={15} />
            Open page
          </button>
          <p className="your-folder-note">{`Opens ${startName(documents.start)} here, in Chips.`}</p>
        </>
      ) : (
        <>
          <p className="your-folder-note">{noStartPageWords(documents.list.length)}</p>
          <Group>
            {documents.list.map((path) => (
              <Row
                key={path}
                face={
                  <Tile>
                    <Icon name="doc" size={14} />
                  </Tile>
                }
                name={path.split("/").pop() ?? path}
                under={path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""}
                onClick={() => onOpen(path)}
                trailing={<Chev />}
                testId={`universe-document-${path}`}
              />
            ))}
          </Group>
        </>
      )}
    </section>
  );
}

/**
 * The room's page, opened in this window because the person asked from another device of theirs
 * (ADR 0227): the start page, or the one document; or, where the space has neither, a word saying
 * so in the dialog it would have opened in.
 */
export function AskedPage(props: {
  readonly project: ProjectActions;
  readonly files: FileService | undefined;
  readonly title: string;
  readonly onClose: () => void;
}) {
  const read = useRead(() => props.project.universe(), "asked", false);
  const [open, setOpen] = useState<string | undefined>(undefined);
  const start = read.value === undefined ? undefined : startOf(read.value);
  const shown = open ?? start;
  if (shown !== undefined) {
    return (
      <ProjectDocument
        path={shown}
        project={props.project}
        files={props.files}
        onFile={setOpen}
        onClose={props.onClose}
      />
    );
  }
  return (
    <PageDialog name={props.title} onClose={props.onClose}>
      {read.failed === undefined && read.value === undefined ? (
        <UniverseReading words="Opening…" />
      ) : (
        <p className="page-view-note" role={read.failed === undefined ? undefined : "alert"}>
          {read.failed ?? "This space has no page to open yet."}
        </p>
      )}
    </PageDialog>
  );
}

/**
 * The film full screen (ADR 0217): `?film=watch` plays that film's video, with the chapter bar,
 * Leave, Skip, and the end card after it (`src/demo/FilmPlayer.tsx`). The workspace switcher's
 * Watch Chips work opens it, on a phone that holds a workspace; a phone in none plays the film on
 * its first screen (ADR 0217's addendum of 26 October). The end card's More walkthroughs plays
 * another here.
 *
 * The video makes no workspace. Look around makes the demo's, played whole, and opens its Spaces.
 * The end card's ways in are the first screen's: Scan a QR code opens the camera over the film,
 * Have an invite link? pastes, and Have a pairing code? opens the pairing code page.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FilmPlayer } from "../src/demo/FilmPlayer";
import { useHome, useLookAround } from "../src/demo/home";
import { VIDEOS, videoNamed } from "../src/demo/videos";
import { ScanSheet } from "../src/pairing/ScanSheet";
import { useJoin } from "../src/pairing/useJoin";
import { useChips } from "../src/store/provider";

export default function FilmScreen() {
  const { film } = useLocalSearchParams<{ film?: string }>();
  const video = videoNamed(film) ?? VIDEOS[0];
  const router = useRouter();
  const { paired } = useChips();
  const home = useHome();
  const lookAround = useLookAround();
  const join = useJoin();
  const [scanning, setScanning] = useState(false);
  const typeCode = () => home(paired?.device, "code");
  if (video === undefined) return null;
  return (
    <>
      <FilmPlayer
        // A film of its own from More walkthroughs: its player is made afresh.
        key={video.key}
        video={video}
        invites={join.invites}
        ways={{
          onLeave: () => (router.canGoBack() ? router.back() : router.replace("/")),
          onScan: () => setScanning(true),
          onType: typeCode,
          onFilm: (key) => router.setParams({ film: key }),
          onLookAround: lookAround,
        }}
      />
      <ScanSheet
        visible={scanning}
        reader={join}
        onClose={() => setScanning(false)}
        onType={() => {
          setScanning(false);
          typeCode();
        }}
      />
    </>
  );
}

/**
 * A page, drawn in a web view that can reach nothing of the app's (ADR 0059, `page.ts`).
 *
 * Every setting below is spelled out rather than left to a default, since a default is the
 * library's to change. The one that matters most is `originWhitelist`: left as it comes, a URL
 * outside it is handed straight to `Linking.openURL`, which is how a page would open a `chips://`
 * link in this very app. Allowing every origin sends every load through `pageLoad` instead, which
 * says what may happen to it. There is no `onMessage`, so the page has no way to post to the app,
 * and `incognito` gives it a store of its own that is gone when the view is. Every document arrives
 * under a policy of its own: an HTML file under core's `withHtmlPolicy` (ADR 0059's addendum),
 * which lets its own script run and nothing leave — no fetch, no socket, no frame, no picture from
 * elsewhere — and a page made from Markdown under `markdownPage`'s, which runs no script.
 *
 * `decelerationRate` is said too, as `normal`, UIKit's own. Left out, the new architecture hands
 * the view a zero, the library sets the scroll view's rate to it, and a page stopped dead under
 * the finger instead of coasting as every other scroll on the phone does (Arjun, 6 October 2026:
 * "feels weird").
 *
 * That and `dataDetectorTypes` are iOS's, and said on iOS alone. The library turns their words into
 * what the view takes (UIKit's number, a list) only there; Android's view, which has neither and
 * ignores both, read the words as a number and a list as they came, and took the app down with
 * every page opened (the emulator, 16 October 2026).
 *
 * `keepsFinger` is Android's alone, for the same reason. Said, the view asks every view that holds
 * it to leave a finger on it alone (`nestedScrollEnabled`), and gesture handler's root then calls
 * off its own gestures, a sheet's pull among them (ADR 0175). A reader on a sheet says it while
 * the page stands off its top, so a drag down scrolls the page back rather than pulling the sheet
 * away (`TextReader`).
 *
 * The view is drawn see-through, so what shows past the page's edges — pulled past its top or its
 * foot — is the ground the view stands on. For an HTML file that is the colour the page says it is
 * drawn on (`GROUND_SCRIPT`), the app's own until it has said; it was white for every page, and a
 * dark one showed a white band (Arjun, 3 November 2026). A page made from Markdown is drawn on the
 * ground it is given.
 */

import { useState } from "react";
import {
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
} from "react-native";
import { WebView, type WebViewProps } from "react-native-webview";
import { usePalette } from "../ui/theme";
import { fileOfLink, GROUND_SCRIPT, groundOfLink, pageLoad } from "./page";

export function PageView({
  html,
  title,
  ground,
  keepsFinger,
  onScrolled,
  onReady,
  onFailed,
  onFile,
  onAddress,
}: {
  readonly html: string;
  readonly title: string;
  /** What shows past the document's edges; without it, the colour the page says it is drawn on. */
  readonly ground?: string | undefined;
  /** Android: the page takes a finger before what holds it can (a sheet's pull). */
  readonly keepsFinger?: boolean | undefined;
  /** How far down the page has been scrolled, as it scrolls. */
  readonly onScrolled?: ((y: number) => void) | undefined;
  /** The document is loaded, so there is something to look at: the sheet fades it in (`PageSheet`). */
  readonly onReady: () => void;
  readonly onFailed: (why: string) => void;
  /** A tapped link to a file of the room's project (ADR 0227); without it, such a link does nothing. */
  readonly onFile?: ((path: string) => void) | undefined;
  /**
   * A tapped link to a web address or mail, handed over rather than opened, with the page it was
   * tapped on, whose words name it: Universe asks first when the address may need the space's
   * program running (ADR 0227's addendum of 9 November 2026), or is one only some devices reach
   * (the addendum of 10 November 2026). Without it, the platform's browser or mail opens it.
   */
  readonly onAddress?: ((url: string, html?: string) => void) | undefined;
}) {
  const platform = Platform.OS === "android" ? "android" : "ios";
  const ios = platform === "ios";
  const palette = usePalette();
  const [said, setSaid] = useState<string | undefined>(undefined);
  // The library types `onScroll` through a module of React Native's that this React Native no
  // longer has types for, so it reads as `undefined`. What arrives is a scroll view's event.
  const scrolls =
    onScrolled === undefined
      ? {}
      : ({
          onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
            onScrolled(event.nativeEvent.contentOffset.y),
        } as unknown as Pick<WebViewProps, "onScroll">);
  return (
    <WebView
      {...scrolls}
      source={{ html }}
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(request) => {
        const decision = pageLoad(request, platform);
        if (decision === "ground") setSaid(groundOfLink(request.url) ?? said);
        if (decision === "outside") {
          if (onAddress !== undefined) onAddress(request.url, html);
          else void Linking.openURL(request.url).catch(() => undefined);
        }
        const file = decision === "file" ? fileOfLink(request.url) : undefined;
        if (file !== undefined) onFile?.(file);
        return decision === "load";
      }}
      javaScriptEnabled
      // At the document's start, not its end: the library adds what runs at the end only with a
      // bridge to the app, which a page never has.
      injectedJavaScriptBeforeContentLoaded={ground === undefined ? GROUND_SCRIPT : undefined}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      allowsLinkPreview={false}
      allowsBackForwardNavigationGestures={false}
      decelerationRate={ios ? "normal" : undefined}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction
      // The page never gets the camera or the microphone, whatever it asks (SEC-7). iOS's word;
      // Android's manager takes it and does nothing, and grants a page what the app holds.
      mediaCapturePermissionGrantType="deny"
      dataDetectorTypes={ios ? "none" : undefined}
      nestedScrollEnabled={ios ? undefined : keepsFinger === true}
      geolocationEnabled={false}
      incognito
      cacheEnabled={false}
      mixedContentMode="never"
      webviewDebuggingEnabled={__DEV__}
      onLoadEnd={onReady}
      onError={(event) => onFailed(event.nativeEvent.description)}
      onContentProcessDidTerminate={() => onFailed("The page stopped. Close it and open it again.")}
      onRenderProcessGone={() => onFailed("The page stopped. Close it and open it again.")}
      accessibilityLabel={title}
      style={[styles.view, { backgroundColor: ground ?? said ?? palette.bg }]}
      testID="page-view"
    />
  );
}

const styles = StyleSheet.create({
  view: { flex: 1 },
});

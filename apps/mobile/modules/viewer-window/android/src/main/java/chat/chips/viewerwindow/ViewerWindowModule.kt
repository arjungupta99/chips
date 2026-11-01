package chat.chips.viewerwindow

import android.app.Activity
import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * `ChipsViewerWindow`: what the media viewer's own window does on Android. The viewer draws its
 * view, one of no size, inside its `Modal` (`src/media/ViewerWindow.tsx`), which on Android is a
 * dialog window of its own over the activity's, and two things are that window's to decide, not the
 * activity's: the status bar while it has focus, and whether it shows while the app is pinned in
 * Picture in Picture — and the pinned window's shape, the video's own.
 */
class ViewerWindowModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChipsViewerWindow")

    View(ViewerWindowView::class) {
      Prop("statusBarHidden") { view: ViewerWindowView, hidden: Boolean ->
        view.statusBarHidden = hidden
      }
      Prop("lightStatusBar") { view: ViewerWindowView, light: Boolean ->
        view.lightStatusBar = light
      }
      Prop("hiddenWhilePinned") { view: ViewerWindowView, hidden: Boolean ->
        view.hiddenWhilePinned = hidden
      }
      Prop("pinnedWidth") { view: ViewerWindowView, width: Int ->
        view.pinnedWidth = width
      }
      Prop("pinnedHeight") { view: ViewerWindowView, height: Int ->
        view.pinnedHeight = height
      }
    }
  }
}

/**
 * The shape of the window a video is pinned in: the video's own. Android refuses a pinned window
 * narrower than 1 : 2.39 or wider than 2.39 : 1.
 */
internal fun shapePinnedWindow(activity: Activity, width: Int, height: Int) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || width <= 0 || height <= 0) return
  val ratio = width.toDouble() / height
  val shape = when {
    ratio < 0.42 -> Rational(42, 100)
    ratio > 2.38 -> Rational(238, 100)
    else -> Rational(width, height)
  }
  try {
    activity.setPictureInPictureParams(PictureInPictureParams.Builder().setAspectRatio(shape).build())
  } catch (refused: RuntimeException) {
    // An activity that cannot be pinned, which the manifest decides: nothing to shape.
  }
}

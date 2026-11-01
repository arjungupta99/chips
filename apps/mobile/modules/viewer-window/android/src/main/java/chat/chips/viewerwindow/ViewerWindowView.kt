package chat.chips.viewerwindow

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import androidx.activity.ComponentActivity
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * What the window this view is attached to does, asked of that window itself. Inside a React
 * Native `Modal` that is the dialog's window, which `expo-status-bar` and a React style cannot
 * reach in time (the media viewer, Phase 3, 15 September 2026):
 *
 * - **The status bar**, hidden or shown, with light or dark icons. While the dialog has focus the
 *   bar is the one it asks for; `expo-status-bar` asks the activity's window, which the dialog
 *   covers, and on the emulator the bar stayed when the viewer's bars went. It asks again whenever
 *   its window gains focus, since a dialog shown again after the app comes back takes the
 *   activity's bars as they were.
 * - **Picture in Picture.** Android pins the whole activity, dialogs and all, and `expo-video`
 *   moves the player to the top of the activity for it, under the dialog. So while pinned the
 *   dialog draws nothing, the activity behind the player is black, and the pinned window is the
 *   video. React cannot do it: a paused activity mounts nothing React renders until it resumes,
 *   and pinned it stays paused. The dialog is made clear rather than invisible, since a window
 *   made invisible and shown again lost the stage's black under it.
 * - **The pinned window's shape**, the video's own, from the size given here. `expo-video` works it
 *   out only for a view that is up when its video loads, and the viewer's is put up after; any
 *   other view it pins 16:9, setting that as it pins, over any shape set before (the emulator: a
 *   clip shot upright pinned 16:9 on one pin in two). So the shape is set again once the app is
 *   pinned, and the pinned window takes it.
 */
class ViewerWindowView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var statusBarHidden: Boolean = false
    set(value) {
      field = value
      applyStatusBar()
    }

  var lightStatusBar: Boolean = true
    set(value) {
      field = value
      applyStatusBar()
    }

  var hiddenWhilePinned: Boolean = false

  /** The video's width and height; no shape is given while either is 0. */
  var pinnedWidth: Int = 0
    set(value) {
      field = value
      applyShape()
    }

  var pinnedHeight: Int = 0
    set(value) {
      field = value
      applyShape()
    }

  private var listeningTo: ComponentActivity? = null
  private var steppedAside = false
  private var activityBackground: Drawable? = null

  private val pinnedChanged = Consumer<PictureInPictureModeChangedInfo> { info ->
    stepAside(info.isInPictureInPictureMode)
    if (info.isInPictureInPictureMode) applyShape()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    applyStatusBar()
    val activity = appContext.currentActivity as? ComponentActivity ?: return
    activity.addOnPictureInPictureModeChangedListener(pinnedChanged)
    listeningTo = activity
  }

  override fun onDetachedFromWindow() {
    stepAside(false)
    listeningTo?.removeOnPictureInPictureModeChangedListener(pinnedChanged)
    listeningTo = null
    super.onDetachedFromWindow()
  }

  private fun applyShape() {
    val activity = appContext.currentActivity ?: return
    shapePinnedWindow(activity, pinnedWidth, pinnedHeight)
  }

  private fun stepAside(pinned: Boolean) {
    val activity = listeningTo ?: return
    val behind = activity.window.decorView
    if (pinned && hiddenWhilePinned && !steppedAside) {
      steppedAside = true
      rootView.alpha = 0f
      activityBackground = behind.background
      behind.setBackgroundColor(Color.BLACK)
    } else if (!pinned && steppedAside) {
      steppedAside = false
      rootView.alpha = 1f
      behind.background = activityBackground
      activityBackground = null
    }
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) applyStatusBar()
  }

  private fun applyStatusBar() {
    if (!isAttachedToWindow) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val controller = windowInsetsController ?: return
      controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.setSystemBarsAppearance(
        if (lightStatusBar) 0 else WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
      )
      if (statusBarHidden) {
        controller.hide(WindowInsets.Type.statusBars())
      } else {
        controller.show(WindowInsets.Type.statusBars())
      }
    } else {
      @Suppress("DEPRECATION")
      val kept = rootView.systemUiVisibility and
        (View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR).inv()
      @Suppress("DEPRECATION")
      rootView.systemUiVisibility = kept or
        (if (statusBarHidden) View.SYSTEM_UI_FLAG_FULLSCREEN else 0) or
        (if (lightStatusBar) 0 else View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR)
    }
  }
}

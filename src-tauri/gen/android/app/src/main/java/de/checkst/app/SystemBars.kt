package de.checkst.app

import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout

/**
 * Colors behind the status bar (top) and navigation bar (bottom). The web view is padded by the
 * system bar insets; two plain views on the window fill exactly that space, so nothing else can
 * paint over the colors the web app picked (CheckstPlugin.systemBars).
 */
object SystemBars {
  var topInset = 0
  var bottomInset = 0
  var topColor = Color.parseColor("#F5F5F3")
  var bottomColor = Color.WHITE
  private var top: View? = null
  private var bottom: View? = null

  fun attach(activity: Activity) {
    val decor = activity.window.decorView as? FrameLayout ?: return
    top = View(activity).also { decor.addView(it, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP)) }
    bottom = View(activity).also { decor.addView(it, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.BOTTOM)) }
    update()
  }

  fun update() {
    top?.let { size(it, topInset, topColor) }
    bottom?.let { size(it, bottomInset, bottomColor) }
  }

  private fun size(view: View, height: Int, color: Int) {
    view.setBackgroundColor(color)
    val params = view.layoutParams
    if (params.height != height) {
      params.height = height
      view.layoutParams = params
    }
  }
}

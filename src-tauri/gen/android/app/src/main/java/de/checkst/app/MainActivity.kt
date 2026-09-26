package de.checkst.app

import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Until the web app reports its theme: the system's light or dark colors.
    val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    SystemBars.topColor = Color.parseColor(if (night) "#1B1B1D" else "#F5F5F3")
    SystemBars.bottomColor = Color.parseColor(if (night) "#252528" else "#FFFFFF")
    SystemBars.attach(this)
    // Keep the web view clear of the status bar, navigation bar and keyboard; SystemBars fills
    // the space above and below it.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime(),
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      SystemBars.topInset = bars.top
      SystemBars.bottomInset = bars.bottom
      SystemBars.update()
      WindowInsetsCompat.CONSUMED
    }
  }
}

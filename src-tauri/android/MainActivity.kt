package ro.danielbrindusa.artagatitului

import android.os.Bundle
import android.graphics.Color
import android.view.View
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    val barColor = Color.rgb(15, 17, 23)
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(barColor),
      navigationBarStyle = SystemBarStyle.dark(barColor)
    )
    super.onCreate(savedInstanceState)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(barColor)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, windowInsets ->
      val handled = WindowInsetsCompat.Type.systemBars() or
        WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      val insets = windowInsets.getInsets(handled)
      view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
      // Propagate zeroed insets so WebView also clears them after the keyboard closes.
      WindowInsetsCompat.Builder(windowInsets).setInsets(handled, Insets.NONE).build()
    }
    ViewCompat.requestApplyInsets(content)
  }
}

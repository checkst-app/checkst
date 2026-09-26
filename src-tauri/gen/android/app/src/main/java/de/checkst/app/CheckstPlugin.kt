package de.checkst.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.core.view.WindowCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.FileNotFoundException
import java.io.IOException

@InvokeArg
class PickArgs {
  var create: Boolean = false
  var name: String = "todo.txt"
}

@InvokeArg
class UriArgs {
  lateinit var uri: String
}

@InvokeArg
class WriteArgs {
  lateinit var uri: String
  lateinit var text: String
}

@InvokeArg
class BarsArgs {
  var dark: Boolean = false
  var top: String = "#F5F5F3"
  var bottom: String = "#FFFFFF"
}

/**
 * todo.txt access through the Storage Access Framework, called from src-tauri/src/android.rs.
 * Picked files keep a persisted read/write grant, so they stay usable after a restart.
 */
@TauriPlugin
class CheckstPlugin(private val activity: Activity) : Plugin(activity) {
  private val resolver get() = activity.contentResolver

  /** Runs file work off the UI thread and turns exceptions into rejections. */
  private fun io(invoke: Invoke, block: () -> Unit) {
    Thread {
      try {
        block()
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }.start()
  }

  @Command
  fun pick(invoke: Invoke) {
    val args = invoke.parseArgs(PickArgs::class.java)
    val intent = if (args.create) {
      Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "text/plain"
        putExtra(Intent.EXTRA_TITLE, args.name)
      }
    } else {
      Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        // Some providers report .txt files as octet-stream.
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/*", "application/octet-stream"))
      }
    }
    intent.addFlags(
      Intent.FLAG_GRANT_READ_URI_PERMISSION or
        Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
    )
    startActivityForResult(invoke, intent, "pickResult")
  }

  @ActivityCallback
  fun pickResult(invoke: Invoke, result: ActivityResult) {
    val ret = JSObject()
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) {
      invoke.resolve(ret)
      return
    }
    try {
      resolver.takePersistableUriPermission(
        uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      )
    } catch (_: SecurityException) {
      // Provider without persistable grants: still usable for this session.
    }
    ret.put("uri", uri.toString())
    ret.put("label", label(uri))
    invoke.resolve(ret)
  }

  @Command
  fun read(invoke: Invoke) {
    val args = invoke.parseArgs(UriArgs::class.java)
    io(invoke) {
      val ret = JSObject()
      try {
        val bytes = resolver.openInputStream(Uri.parse(args.uri))?.use { it.readBytes() }
        ret.put("exists", bytes != null)
        ret.put("text", bytes?.toString(Charsets.UTF_8) ?: "")
      } catch (_: FileNotFoundException) {
        ret.put("exists", false)
        ret.put("text", "")
      }
      invoke.resolve(ret)
    }
  }

  @Command
  fun write(invoke: Invoke) {
    val args = invoke.parseArgs(WriteArgs::class.java)
    io(invoke) {
      val uri = Uri.parse(args.uri)
      val bytes = args.text.toByteArray(Charsets.UTF_8)
      // "wt" truncates; some providers only accept "rwt".
      val out = try {
        resolver.openOutputStream(uri, "wt")
      } catch (_: Exception) {
        null
      } ?: resolver.openOutputStream(uri, "rwt")
      out?.use {
        it.write(bytes)
        it.flush()
      } ?: throw IOException("Cannot write $uri")
      invoke.resolve(JSObject())
    }
  }

  @Command
  fun info(invoke: Invoke) {
    val args = invoke.parseArgs(UriArgs::class.java)
    io(invoke) {
      val exists = try {
        resolver.query(Uri.parse(args.uri), arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
          ?.use { it.moveToFirst() } ?: false
      } catch (_: Exception) {
        false
      }
      val ret = JSObject()
      ret.put("exists", exists)
      invoke.resolve(ret)
    }
  }

  /** Background behind the status bar (top) and navigation bar (bottom), light or dark icons. */
  @Command
  fun systemBars(invoke: Invoke) {
    val args = invoke.parseArgs(BarsArgs::class.java)
    activity.runOnUiThread {
      try {
        SystemBars.topColor = Color.parseColor(args.top)
        SystemBars.bottomColor = Color.parseColor(args.bottom)
        SystemBars.update()
        WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
          isAppearanceLightStatusBars = !args.dark
          isAppearanceLightNavigationBars = !args.dark
        }
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        android.util.Log.w("checkst", "systemBars(${args.top}, ${args.bottom}): $e")
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  private fun displayName(uri: Uri): String? = try {
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
      if (it.moveToFirst()) it.getString(0) else null
    }
  } catch (_: Exception) {
    null
  }

  /** "Syncthing/Aufgaben/todo.txt" for local storage, otherwise "Drive · todo.txt". */
  private fun label(uri: Uri): String {
    val name = displayName(uri) ?: "todo.txt"
    try {
      if (uri.authority == "com.android.externalstorage.documents") {
        val path = DocumentsContract.getDocumentId(uri).substringAfter(':')
        if (path.isNotEmpty()) return path
      }
      val pm = activity.packageManager
      val provider = pm.resolveContentProvider(uri.authority ?: "", 0)
      val app = provider?.loadLabel(pm)?.toString()
      if (!app.isNullOrBlank()) return "$app · $name"
    } catch (_: Exception) {
    }
    return name
  }
}

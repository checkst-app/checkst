package de.checkst.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

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

@InvokeArg
class UrlArgs {
  lateinit var url: String
}

@InvokeArg
class InstallArgs {
  /** Open the "Install unknown apps" setting if it is still off. */
  var askPermission: Boolean = true
}

@InvokeArg
class FeedbackArgs {
  /** "confirm", "tick", "threshold" or "longpress" */
  var haptic: String? = null
  /** "complete" */
  var sound: String? = null
}

/**
 * todo.txt access through the Storage Access Framework, called from src-tauri/src/android.rs.
 * Picked files keep a persisted read/write grant, so they stay usable after a restart.
 * Also downloads release APKs and hands them to the system installer (in-app updates), and
 * gives haptic and sound feedback.
 */
@TauriPlugin
class CheckstPlugin(private val activity: Activity) : Plugin(activity) {
  private val resolver get() = activity.contentResolver

  // Progress of the running APK download, polled by the web app.
  @Volatile private var apkDownloaded = 0L
  @Volatile private var apkTotal = -1L
  private val apkDir get() = File(activity.cacheDir, "updates")
  private val apkFile get() = File(apkDir, "checkst-update.apk")

  // The "checked off" sound, played as a system sound.
  private var sounds: SoundPool? = null
  private var completeSound = 0

  override fun load(webView: WebView) {
    super.load(webView)
    // A new start means the last update is installed (or was abandoned): drop the old APK.
    Thread { apkDir.deleteRecursively() }.start()
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    sounds = SoundPool.Builder().setMaxStreams(2).setAudioAttributes(attributes).build().also {
      completeSound = it.load(activity, R.raw.complete, 1)
    }
  }

  override fun onDestroy() {
    sounds?.release()
    sounds = null
    super.onDestroy()
  }

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

  /** Downloads a release APK into the cache; resolves when it is complete and checked. */
  @Command
  fun downloadApk(invoke: Invoke) {
    val args = invoke.parseArgs(UrlArgs::class.java)
    io(invoke) {
      apkDownloaded = 0
      apkTotal = -1
      apkDir.mkdirs()
      val part = File(apkDir, "checkst-update.download.apk")
      // GitHub redirects release downloads to its CDN (https to https, followed automatically).
      val conn = URL(args.url).openConnection() as HttpURLConnection
      conn.connectTimeout = 15_000
      conn.readTimeout = 30_000
      try {
        if (conn.responseCode !in 200..299) throw IOException("HTTP ${conn.responseCode}")
        apkTotal = conn.contentLengthLong
        conn.inputStream.use { input ->
          part.outputStream().use { out ->
            val buf = ByteArray(64 * 1024)
            while (true) {
              val n = input.read(buf)
              if (n < 0) break
              out.write(buf, 0, n)
              apkDownloaded += n
            }
          }
        }
      } finally {
        conn.disconnect()
      }
      // Only hand over an APK of this app; the installer itself checks signature and version.
      if (archiveInfo(part)?.packageName != activity.packageName) {
        part.delete()
        throw IOException("The download is not a checkst APK")
      }
      apkFile.delete()
      if (!part.renameTo(apkFile)) throw IOException("Cannot store the update")
      invoke.resolve(JSObject())
    }
  }

  @Command
  fun apkProgress(invoke: Invoke) {
    val ret = JSObject()
    ret.put("downloaded", apkDownloaded)
    ret.put("total", apkTotal)
    invoke.resolve(ret)
  }

  /**
   * Opens the system installer for the downloaded APK ("Update this app?"). Android 8+ first
   * needs "Install unknown apps" for checkst: then `needsPermission` is set and, with
   * `askPermission`, that settings page opens; the web app retries when checkst is back.
   */
  @Command
  fun installApk(invoke: Invoke) {
    val args = invoke.parseArgs(InstallArgs::class.java)
    val file = apkFile
    if (!file.exists()) {
      invoke.reject("No update downloaded")
      return
    }
    val ret = JSObject()
    val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls()
    ret.put("needsPermission", !allowed)
    val intent = if (allowed) {
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
      Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
    } else if (args.askPermission) {
      Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
    } else {
      invoke.resolve(ret)
      return
    }
    activity.runOnUiThread {
      try {
        activity.startActivity(intent)
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  /**
   * Haptic and sound feedback for task actions. Haptics follow the system's "touch feedback"
   * setting (no vibrate permission needed); the sound only plays in normal ringer mode.
   */
  @Command
  fun feedback(invoke: Invoke) {
    val args = invoke.parseArgs(FeedbackArgs::class.java)
    activity.runOnUiThread {
      val haptic = when (args.haptic) {
        "confirm" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
        "tick" -> HapticFeedbackConstants.KEYBOARD_TAP
        "longpress" -> HapticFeedbackConstants.LONG_PRESS
        "threshold" ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE
          else HapticFeedbackConstants.CONTEXT_CLICK
        else -> null
      }
      if (haptic != null) activity.window.decorView.performHapticFeedback(haptic)
      if (args.sound == "complete") {
        val audio = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (audio.ringerMode == AudioManager.RINGER_MODE_NORMAL) sounds?.play(completeSound, 1f, 1f, 1, 0, 1f)
      }
      invoke.resolve(JSObject())
    }
  }

  private fun archiveInfo(file: File): PackageInfo? {
    val pm = activity.packageManager
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.getPackageArchiveInfo(file.path, PackageManager.PackageInfoFlags.of(0))
    } else {
      @Suppress("DEPRECATION")
      pm.getPackageArchiveInfo(file.path, 0)
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

package com.nutriscan.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.widget.Button
import android.widget.FrameLayout
import java.io.File

/**
 * Capture photo Camera2 native : contrairement à l'Intent système, la session
 * est contrôlée par l'app, ce qui permet de lire au déclenchement les
 * métadonnées matérielles `LENS_FOCUS_DISTANCE` (dioptries) et `LENS_FOCAL_LENGTH`.
 *
 * Résultat (extras) : path, focusDiopters, distanceM, focalMm, calibration,
 * sensorWidthMm, sensorHeightMm.
 */
class Camera2CaptureActivity : Activity() {

    private lateinit var texture: TextureView
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var chars: CameraCharacteristics? = null
    private var sensorOrientation = 90

    private var jpeg: ByteArray? = null
    private var meta: CaptureResult? = null
    private var capturing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        texture = TextureView(this)
        root.addView(texture, FrameLayout.LayoutParams(-1, -1))
        val shutter = Button(this).apply {
            text = "●"
            textSize = 28f
            setOnClickListener { takePicture() }
        }
        root.addView(shutter, FrameLayout.LayoutParams(220, 220, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = 120 })
        val cancel = Button(this).apply {
            text = "✕"
            setOnClickListener { setResult(RESULT_CANCELED); finish() }
        }
        root.addView(cancel, FrameLayout.LayoutParams(160, 160, Gravity.TOP or Gravity.START).apply { topMargin = 80; leftMargin = 40 })
        setContentView(root)

        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), 1)
        } else start()
    }

    override fun onRequestPermissionsResult(rc: Int, p: Array<out String>, r: IntArray) {
        super.onRequestPermissionsResult(rc, p, r)
        if (r.firstOrNull() == PackageManager.PERMISSION_GRANTED) start()
        else { setResult(RESULT_CANCELED, Intent().putExtra("error", "permission")); finish() }
    }

    private fun start() {
        thread = HandlerThread("cam2").also { it.start() }
        handler = Handler(thread!!.looper)
        if (texture.isAvailable) openCamera()
        else texture.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(s: SurfaceTexture, w: Int, h: Int) = openCamera()
            override fun onSurfaceTextureSizeChanged(s: SurfaceTexture, w: Int, h: Int) {}
            override fun onSurfaceTextureDestroyed(s: SurfaceTexture) = true
            override fun onSurfaceTextureUpdated(s: SurfaceTexture) {}
        }
    }

    @SuppressLint("MissingPermission")
    private fun openCamera() {
        val mgr = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val id = mgr.cameraIdList.firstOrNull {
            mgr.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        } ?: mgr.cameraIdList.firstOrNull() ?: return fail("no-camera")
        val c = mgr.getCameraCharacteristics(id)
        chars = c
        sensorOrientation = c.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
        val map = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP) ?: return fail("no-config")
        // JPEG ≤ ~12 MP pour limiter la mémoire ; preview 1280-1920 px.
        val jpegSize = map.getOutputSizes(ImageFormat.JPEG)
            .filter { it.width * it.height <= 12_500_000 }
            .maxByOrNull { it.width * it.height } ?: map.getOutputSizes(ImageFormat.JPEG).first()
        val ratio = jpegSize.width.toFloat() / jpegSize.height
        val prev = map.getOutputSizes(SurfaceTexture::class.java)
            .filter { it.width <= 1920 && kotlin.math.abs(it.width.toFloat() / it.height - ratio) < 0.05f }
            .maxByOrNull { it.width * it.height } ?: map.getOutputSizes(SurfaceTexture::class.java).first()

        reader = ImageReader.newInstance(jpegSize.width, jpegSize.height, ImageFormat.JPEG, 2).apply {
            setOnImageAvailableListener({ r ->
                r.acquireNextImage()?.use { img ->
                    val buf = img.planes[0].buffer
                    jpeg = ByteArray(buf.remaining()).also { buf.get(it) }
                }
                maybeFinish()
            }, handler)
        }

        mgr.openCamera(id, object : CameraDevice.StateCallback() {
            override fun onOpened(d: CameraDevice) {
                device = d
                val st = texture.surfaceTexture!!.apply { setDefaultBufferSize(prev.width, prev.height) }
                val surf = Surface(st)
                @Suppress("DEPRECATION")
                d.createCaptureSession(listOf(surf, reader!!.surface), object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(s: CameraCaptureSession) {
                        session = s
                        val req = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                            addTarget(surf)
                            set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                        }
                        s.setRepeatingRequest(req.build(), null, handler)
                    }
                    override fun onConfigureFailed(s: CameraCaptureSession) = fail("session")
                }, handler)
            }
            override fun onDisconnected(d: CameraDevice) { d.close() }
            override fun onError(d: CameraDevice, e: Int) { d.close(); fail("camera-$e") }
        }, handler)
    }

    private fun takePicture() {
        val d = device ?: return
        val s = session ?: return
        if (capturing) return
        capturing = true
        val rotation = when (windowManager.defaultDisplay.rotation) {
            Surface.ROTATION_90 -> 90; Surface.ROTATION_180 -> 180; Surface.ROTATION_270 -> 270; else -> 0
        }
        val req = d.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
            addTarget(reader!!.surface)
            set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
            set(CaptureRequest.JPEG_ORIENTATION, (sensorOrientation - rotation + 360) % 360)
            set(CaptureRequest.JPEG_QUALITY, 90.toByte())
        }
        s.capture(req.build(), object : CameraCaptureSession.CaptureCallback() {
            override fun onCaptureCompleted(cs: CameraCaptureSession, r: CaptureRequest, res: TotalCaptureResult) {
                meta = res
                maybeFinish()
            }
            override fun onCaptureFailed(cs: CameraCaptureSession, r: CaptureRequest, f: CaptureFailure) {
                capturing = false
            }
        }, handler)
    }

    @Synchronized
    private fun maybeFinish() {
        val bytes = jpeg ?: return
        val m = meta ?: return
        val file = File(cacheDir, "cam2_${System.currentTimeMillis()}.jpg").apply { writeBytes(bytes) }
        val diopters = m.get(CaptureResult.LENS_FOCUS_DISTANCE)
        val calib = when (chars?.get(CameraCharacteristics.LENS_INFO_FOCUS_DISTANCE_CALIBRATION)) {
            CameraCharacteristics.LENS_INFO_FOCUS_DISTANCE_CALIBRATION_CALIBRATED -> "calibrated"
            CameraCharacteristics.LENS_INFO_FOCUS_DISTANCE_CALIBRATION_APPROXIMATE -> "approximate"
            else -> "uncalibrated"
        }
        val sensor = chars?.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
        val out = Intent().putExtra("path", file.absolutePath).putExtra("calibration", calib)
        if (diopters != null && diopters > 0f) {
            out.putExtra("focusDiopters", diopters.toDouble())
            // Dioptries → mètres uniquement si l'unité est réellement métrique.
            if (calib != "uncalibrated") out.putExtra("distanceM", 1.0 / diopters)
        }
        m.get(CaptureResult.LENS_FOCAL_LENGTH)?.let { out.putExtra("focalMm", it.toDouble()) }
        sensor?.let { out.putExtra("sensorWidthMm", it.width.toDouble()); out.putExtra("sensorHeightMm", it.height.toDouble()) }
        runOnUiThread { setResult(RESULT_OK, out); finish() }
    }

    private fun fail(reason: String) {
        runOnUiThread { setResult(RESULT_CANCELED, Intent().putExtra("error", reason)); finish() }
    }

    override fun onDestroy() {
        try { session?.close(); device?.close(); reader?.close() } catch (_: Exception) {}
        thread?.quitSafely()
        super.onDestroy()
    }
}

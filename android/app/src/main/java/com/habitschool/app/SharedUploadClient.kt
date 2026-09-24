package com.habitschool.app

import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 공유받은 파일을 크롬을 거치지 않고 서버에 올린다 (functions/shared-upload.js).
 *
 * 2026-09-24: 크롬 153 이 TWA 공유에서 파일을 버린다. [SharedFileRelay] 가 복사까지
 * 끝낸 파일을 `/api/shared-upload` 에 그대로 올리고, 받은 id 를 웹 주소에 붙여 연다.
 * 웹은 로그인한 상태로 그 id 의 파일을 받아 가고, 서버는 받는 즉시 지운다.
 *
 * 하나라도 실패하면 null — 런처는 예전 길(크롬 share target)로 돌아간다.
 * 메인 스레드에서 부르지 않는다.
 */
object SharedUploadClient {
    private const val TAG = "SharedUploadClient"
    private const val MAX_BYTES = 8L * 1024 * 1024
    private const val CONNECT_TIMEOUT_MS = 8_000
    private const val READ_TIMEOUT_MS = 20_000
    private val ID_PATTERN = Regex("^[a-f0-9]{32}$")

    private val CONTENT_TYPES = mapOf(
        "png" to "image/png",
        "jpg" to "image/jpeg",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "heic" to "image/heic",
        "csv" to "text/csv"
    )

    fun endpoint(): String = "${AppRoutes.WEB_ORIGIN}/api/shared-upload"

    fun uploadAll(files: List<File>): List<String>? {
        if (files.isEmpty()) return null
        val ids = mutableListOf<String>()
        for (file in files) {
            ids += upload(file) ?: return null
        }
        return ids
    }

    private fun upload(file: File): String? {
        val type = CONTENT_TYPES[file.extension.lowercase()] ?: return null
        val size = file.length()
        if (size <= 0L || size > MAX_BYTES) {
            Log.w(TAG, "skip upload: size=$size")
            return null
        }
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(endpoint()).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                useCaches = false
                setRequestProperty("Content-Type", type)
                setFixedLengthStreamingMode(size)
            }
            connection.outputStream.use { sink -> file.inputStream().use { it.copyTo(sink) } }
            val status = connection.responseCode
            if (status != HttpURLConnection.HTTP_OK) {
                Log.w(TAG, "upload rejected: $status")
                return null
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            JSONObject(body).optString("id").takeIf(ID_PATTERN::matches)
        } catch (error: Exception) {
            Log.w(TAG, "upload failed", error)
            null
        } finally {
            connection?.disconnect()
        }
    }
}

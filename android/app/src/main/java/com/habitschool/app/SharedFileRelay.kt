package com.habitschool.app

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.browser.trusted.sharing.ShareData
import androidx.core.content.FileProvider
import androidx.core.content.IntentCompat
import java.io.File

/**
 * 다른 앱이 공유한 파일을 크롬이 읽을 수 있는 모양으로 옮겨 싣는다.
 *
 * 2026-09-23: Fitdays 결과 화면을 공유하면 크롬이 빈 요청을 보냈다
 * (서비스 워커 진단 `{"fields":[],"files":[]}`). 크롬은 공유된 파일마다 보낸 앱이
 * 알려 주는 MIME 을 share target 의 accept 와 맞춰 보고, 맞지 않거나 읽을 수 없으면
 * 조용히 버린다. 보낸 앱이 MIME 을 비워 두거나, EXTRA_STREAM 대신 ClipData 에만
 * 싣거나, 자기 앱 안의 file:// 경로를 넘기면 전부 여기서 사라진다.
 *
 * 공유 인텐트를 먼저 받는 것은 이 앱이다. 그래서 여기서 파일을 한 번 읽어 앱
 * 캐시로 복사하고, 내용(첫 바이트)으로 종류를 정한 확장자를 붙여 우리
 * FileProvider 로 크롬에 넘긴다. 크롬은 그 확장자로 MIME 을 받으므로 더는
 * 버릴 이유가 없다.
 *
 * 무엇이 왔는지는 title 에 짧게 적어 보낸다 (`hsdiag:` 로 시작). 서비스 워커가
 * 빈손일 때 그 줄을 진단에 남겨, 다음 제보에 "보낸 앱이 무엇을 넘겼는지" 가 실린다.
 * 내용은 적지 않는다 — 종류·출처 앱·읽을 수 있었는지만.
 *
 * 2026-09-24: 그래도 크롬 153 은 파일을 버렸다(`copied:jpg` 인데 `files:[]`).
 * 복사한 파일은 [PreparedShare.files] 로도 돌려주어, 런처가 크롬을 거치지 않고
 * 서버로 올릴 수 있게 한다 ([SharedUploadClient]). 이 ShareData 는 그 길이 실패할
 * 때의 예비다.
 */
class PreparedShare(val shareData: ShareData, val files: List<File>, val source: String?)

object SharedFileRelay {
    private const val TAG = "SharedFileRelay"
    private const val RELAY_DIR = "shared"
    private const val MAX_BYTES = 25L * 1024 * 1024
    private const val MAX_FILES = 5

    fun authority(context: Context): String = "${context.packageName}.share"

    /** 공유 인텐트에 실린 파일 주소. EXTRA_STREAM 이 없으면 ClipData 에서 찾는다. */
    fun sharedUris(intent: Intent): List<Uri> {
        val streams = mutableListOf<Uri>()
        if (intent.action == Intent.ACTION_SEND) {
            IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let(streams::add)
        } else if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
                ?.let(streams::addAll)
        }
        if (streams.isEmpty()) {
            val clip: ClipData? = intent.clipData
            if (clip != null) {
                for (i in 0 until clip.itemCount) clip.getItemAt(i)?.uri?.let(streams::add)
            }
        }
        return streams.distinct().take(MAX_FILES)
    }

    /**
     * 파일을 복사해 크롬에 넘길 ShareData 를 만든다. 메인 스레드에서 부르지 않는다.
     * 복사하지 못한 파일은 원래 주소를 그대로 넘긴다 — 크롬이 읽을 수 있을지도 모른다.
     */
    fun prepare(context: Context, intent: Intent): PreparedShare {
        val uris = sharedUris(intent)
        val diag = mutableListOf(
            "hsdiag:v1",
            "action=${intent.action?.substringAfterLast('.') ?: "-"}",
            "type=${intent.type ?: "-"}",
            "uris=${uris.size}",
            "clip=${intent.clipData?.itemCount ?: 0}",
            "text=${intent.getStringExtra(Intent.EXTRA_TEXT)?.length ?: 0}"
        )

        val dir = File(context.cacheDir, RELAY_DIR)
        runCatching { dir.deleteRecursively(); dir.mkdirs() }

        val forwarded = mutableListOf<Uri>()
        val copiedFiles = mutableListOf<File>()
        uris.forEachIndexed { index, uri ->
            val declared = runCatching { context.contentResolver.getType(uri) }.getOrNull()
            val copied = runCatching { copyWithDetectedExtension(context, uri, dir, index) }
                .onFailure { Log.w(TAG, "copy failed for #$index", it) }
                .getOrNull()
            diag += "f$index=${uri.scheme ?: "-"}|${uri.authority ?: "-"}|${declared ?: "-"}|" +
                (copied?.let { "copied:${it.extension}" } ?: "not-copied")
            copied?.let(copiedFiles::add)
            forwarded += copied?.let { FileProvider.getUriForFile(context, authority(context), it) } ?: uri
        }

        return PreparedShare(
            ShareData(diag.joinToString(";").take(480), intent.getStringExtra(Intent.EXTRA_TEXT), forwarded),
            copiedFiles,
            shareSource(uris)
        )
    }

    /**
     * 어느 앱이 보낸 공유인가. 파일 주소의 authority 가 보낸 앱의 FileProvider 라
     * 그 앱을 알려 준다 (Fitdays: `cn.fitdays.fitdays.cameraalbum.fileprovider`).
     * 웹은 체성분 앱에서 온 사진이면 "어디에 넣을까요?" 를 묻지 않는다.
     * 앱 이름만 넘긴다 — 파일 경로는 넘기지 않는다.
     */
    private fun shareSource(uris: List<Uri>): String? =
        uris.firstNotNullOfOrNull { uri ->
            uri.authority?.takeIf { uri.scheme == "content" && it.matches(Regex("^[A-Za-z0-9._-]{1,120}$")) }
        }

    private fun copyWithDetectedExtension(context: Context, uri: Uri, dir: File, index: Int): File? {
        val input = context.contentResolver.openInputStream(uri) ?: return null
        val temp = File(dir, "incoming-$index.tmp")
        var total = 0L
        input.use { source ->
            temp.outputStream().use { sink ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = source.read(buffer)
                    if (read < 0) break
                    total += read
                    if (total > MAX_BYTES) {
                        temp.delete()
                        return null
                    }
                    sink.write(buffer, 0, read)
                }
            }
        }
        if (total == 0L) {
            temp.delete()
            return null
        }
        val head = ByteArray(16)
        val headSize = temp.inputStream().use { it.read(head) }
        val extension = detectExtension(head, headSize, uri, context) ?: run {
            temp.delete()
            return null
        }
        val target = File(dir, "shared-$index.$extension")
        if (!temp.renameTo(target)) {
            temp.copyTo(target, overwrite = true)
            temp.delete()
        }
        return target
    }

    /** 서비스 워커 sniffSharedFileType 과 같은 판정. 사진·CSV 가 아니면 넘기지 않는다. */
    private fun detectExtension(head: ByteArray, size: Int, uri: Uri, context: Context): String? {
        fun at(i: Int) = if (i < size) head[i].toInt() and 0xff else -1
        if (at(0) == 0x89 && at(1) == 0x50 && at(2) == 0x4e && at(3) == 0x47) return "png"
        if (at(0) == 0xff && at(1) == 0xd8 && at(2) == 0xff) return "jpg"
        if (at(0) == 0x47 && at(1) == 0x49 && at(2) == 0x46 && at(3) == 0x38) return "gif"
        if (at(0) == 0x52 && at(1) == 0x49 && at(2) == 0x46 && at(3) == 0x46 &&
            at(8) == 0x57 && at(9) == 0x45 && at(10) == 0x42 && at(11) == 0x50
        ) return "webp"
        if (at(4) == 0x66 && at(5) == 0x74 && at(6) == 0x79 && at(7) == 0x70) {
            val brand = String(head, 8, minOf(4, maxOf(0, size - 8)), Charsets.US_ASCII)
            if (brand in setOf("heic", "heix", "hevc", "mif1", "msf1", "heim", "heis")) return "heic"
        }
        val declared = runCatching { context.contentResolver.getType(uri) }.getOrNull().orEmpty()
        val name = uri.lastPathSegment.orEmpty().lowercase()
        if (declared.contains("csv") || name.endsWith(".csv")) return "csv"
        return null
    }
}

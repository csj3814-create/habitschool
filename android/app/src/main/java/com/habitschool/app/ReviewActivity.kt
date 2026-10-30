package com.habitschool.app

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.play.core.review.ReviewManagerFactory
import com.google.android.play.core.ktx.launchReview
import com.google.android.play.core.ktx.requestReview
import kotlinx.coroutines.launch

/**
 * 플레이 앱 안 평점 창 (1.0.12).
 *
 * 웹이 7일 연속 보상을 받은 직후 habitschool://review/request 를 연다(NativeEntryActivity).
 * 화면 없이 지나가는 활동이다 — 구글 평점 창을 띄우고, 닫히면 끝낸다. 그 아래에 있던
 * 웹 화면이 그대로 돌아온다(다시 열지 않으니 새로고침도 없다).
 *
 * 창을 띄울지는 구글이 정한다. 같은 사람에게 자주 뜨지 않게 횟수를 막아서, 요청해도
 * 아무것도 안 뜰 수 있고 회원이 별점을 남겼는지도 알려 주지 않는다. 그래서 실패해도
 * 조용히 끝낸다.
 */
class ReviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) return

        lifecycleScope.launch {
            runCatching {
                val manager = ReviewManagerFactory.create(this@ReviewActivity)
                manager.launchReview(this@ReviewActivity, manager.requestReview())
            }.onFailure { Log.w(TAG, "in-app review failed", it) }
            finish()
        }
    }

    private companion object {
        const val TAG = "HabitschoolReview"
    }
}

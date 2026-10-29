"use strict";

/**
 * 서버 오류 문장의 영어 (해외 3단계 E6-2, 2026-10-23).
 *
 * 서버는 회원 언어를 몰라도 된다. 콜러블이 HttpsError 를 던지면 입구(localizeCallable)가
 * 한국어 문장을 이 표에서 찾아 details.en 에 영어를 실어 보낸다. 한국어 message 는 그대로 —
 * 화면 몇 곳이 한국어 문장 일부로 갈래를 고르기 때문이다(js/blockchain-manager.js 의 '포인트가 부족').
 * 화면은 js/i18n.js serverErrorText 가 언어를 보고 고른다. 영어가 없는 문장은 영어 화면에
 * 한국어 대신 화면 쪽 기본 문장이 나간다.
 *
 * 서버에 새 오류 문장을 쓰면 여기에도 영어를 단다 — tests/server-error-english.test.js 가
 * 회원에게 가는 한국어 문장마다 영어가 있는지 본다. 일본어가 오면 같은 모양으로 ja 를 더한다.
 */

const { HttpsError } = require("firebase-functions/v2/https");

const HANGUL = /[가-힣]/;

const EXACT = new Map([
    ["로그인이 필요합니다.", "Please sign in."],
    ["로그인이 필요", "Please sign in."],
    ["로그인 필요", "Please sign in."],
    ["사용자 정보를 찾을 수 없습니다.", "Could not find your account."],
    ["보관 기간 30일이 지나 복구할 수 없습니다.", "The 30-day hold has ended, so the account can't be restored."],
    ["사용자를 찾을 수 없습니다.", "Could not find that member."],
    ["가입 사용자 정보를 찾을 수 없습니다.", "Could not find your account."],
    ["관리자 권한이 필요합니다.", "Admin access is required."],
    ["기간은 YYYY-MM-DD 형식으로 보내 주세요.", "Send the dates as YYYY-MM-DD."],
    ["시작일이 종료일보다 늦습니다.", "The start date is after the end date."],
    ["기간은 366일 이내로 골라 주세요.", "Pick a range of 366 days or fewer."],

    // AI 분석
    ["분석이 너무 오래 걸렸어요. 다시 시도해주세요.", "The analysis took too long. Please try again."],
    ["이미지 URL이 필요합니다.", "An image is required."],
    ["허용되지 않은 이미지 URL입니다.", "This image address is not allowed."],
    ["이미지를 불러올 수 없습니다.", "Could not load the image."],
    ["AI 응답 파싱에 실패했습니다. 다시 시도해주세요.", "Could not read the AI response. Please try again."],
    ["AI 응답 파싱에 실패했습니다. 사진이 선명한지 확인해주세요.", "Could not read the AI response. Please check that the photo is clear."],
    ["영상이 너무 커서 분석할 수 없어요. 더 짧게 찍어 올려 주세요.", "The video is too large to analyze. Please record a shorter one."],
    ["건강정보 동의가 필요해요. 프로필에서 동의한 뒤 사용해 주세요.", "Health data consent is needed. Please agree in your profile first."],
    ["운동 분석 중 오류가 발생했습니다.", "Something went wrong while analyzing the exercise."],
    ["영상 URL이 필요합니다.", "A video is required."],
    ["허용되지 않은 영상 URL입니다.", "This video address is not allowed."],
    ["영상을 불러올 수 없습니다.", "Could not load the video."],
    ["운동 영상 분석 중 오류가 발생했습니다.", "Something went wrong while analyzing the workout video."],
    ["식단 분석 중 오류가 발생했습니다.", "Something went wrong while analyzing the meal."],
    ["잘못된 data URL 형식입니다.", "The image data is in the wrong format."],
    ["허용되지 않은 이미지 형식입니다.", "This image format is not allowed."],
    ["이미지 크기가 너무 큽니다 (최대 5MB).", "The image is too large (max 5 MB)."],
    ["공유 이미지 분류 중 오류가 발생했습니다.", "Something went wrong while sorting the shared image."],
    ["이미지 또는 텍스트 데이터가 필요합니다.", "An image or text is required."],
    ["수면/마음 분석 중 오류가 발생했습니다. 다시 시도해주세요.", "Something went wrong while analyzing sleep and mind. Please try again."],
    ["유효한 걸음수 이미지가 아닙니다.", "This is not a valid step count image."],
    ["유효한 건강 앱 걸음수 화면을 확인하지 못했습니다.", "Could not find a step count screen from a health app."],
    ["걸음수 인식 신뢰도가 낮습니다. 더 선명한 화면을 올려주세요.", "The step count was hard to read. Please upload a clearer screenshot."],
    ["걸음수 분석 중 오류가 발생했습니다.", "Something went wrong while reading the step count."],
    ["사진, PDF, 엑셀 파일만 분석할 수 있습니다.", "Only photos, PDF and Excel files can be analyzed."],
    ["혈액검사 분석 중 오류가 발생했습니다.", "Something went wrong while analyzing the blood test."],
    ["체성분 분석 중 오류가 발생했습니다.", "Something went wrong while analyzing the body composition."],

    // 갤러리·번역
    ["게시물을 찾을 수 없습니다.", "Could not find the post."],
    ["postId가 필요합니다.", "A post is required."],
    ["logId가 필요합니다.", "A log is required."],
    ["유효하지 않은 리액션 유형입니다.", "This reaction type is not valid."],
    ["댓글 내용이 필요합니다.", "Please write a comment."],
    ["본인 댓글만 삭제할 수 있습니다.", "You can only delete your own comments."],
    ["지원하지 않는 언어입니다.", "This language is not supported."],
    ["번역하지 못했어요.", "Could not translate."],

    // 초대·친구
    ["초대한 사용자를 찾을 수 없습니다.", "Could not find the member who invited you."],
    ["유효하지 않은 초대 코드", "This invite code is not valid."],
    ["존재하지 않는 초대 코드", "This invite code does not exist."],
    ["본인 초대 코드 사용 불가", "You cannot use your own invite code."],
    ["이미 초대 코드를 사용했습니다", "You have already used an invite code."],
    ["초대 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.", "Could not create an invite code. Please try again in a moment."],
    ["연결 코드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.", "Could not create a link code. Please try again in a moment."],
    ["존재하지 않는 초대 링크입니다.", "This invite link does not exist."],
    ["friendshipId가 필요합니다.", "A friendship is required."],
    ["해당 친구 코드를 가진 사용자를 찾지 못했습니다.", "No member has that friend code."],
    ["친구 대상 정보가 필요합니다.", "Please choose who to add."],
    ["자기 자신에게는 친구 요청을 보낼 수 없습니다.", "You cannot send a friend request to yourself."],
    ["요청자 정보를 찾을 수 없습니다.", "Could not find the member who sent the request."],
    ["친구 요청 대상을 찾을 수 없습니다.", "Could not find that member."],
    ["accept 값이 필요합니다.", "Please accept or decline."],
    ["친구 요청을 찾을 수 없습니다.", "Could not find the friend request."],
    ["이 친구 요청에 응답할 권한이 없습니다.", "You cannot reply to this friend request."],
    ["이미 처리된 친구 요청입니다.", "This friend request was already handled."],
    ["수락 또는 거절은 요청을 받은 사용자만 할 수 있습니다.", "Only the member who received the request can accept or decline it."],
    ["친구 요청이 만료되었습니다.", "This friend request has expired."],
    ["친구 요청 사용자 정보를 찾을 수 없습니다.", "Could not find the member in this friend request."],
    ["친구 관계를 찾을 수 없습니다.", "Could not find this friendship."],
    ["이 친구 관계를 수정할 권한이 없습니다.", "You cannot change this friendship."],

    // 포인트 → HBT 전환
    ["사용자 지갑 주소를 찾을 수 없습니다.", "Could not find your wallet address."],
    ["이전 변환이 처리 중입니다. 잠시 후 다시 시도해주세요.", "Your previous conversion is still being processed. Please try again in a moment."],
    ["100P 단위로만 변환 가능합니다.", "You can only convert in steps of 100P."],
    ["지갑이 생성되지 않았습니다. 앱을 다시 로드해주세요.", "Your wallet has not been created yet. Please reload the app."],
    ["포인트가 부족합니다 (동시 요청 감지).", "Not enough points (another request was in progress)."],
    ["온체인 민팅에 실패했습니다. 잠시 후 다시 시도해주세요.", "Minting on-chain failed. Please try again in a moment."],
    ["변환 처리 중 오류가 발생했습니다.", "Something went wrong during the conversion."],
    ["HBT 거래 이력을 불러오는 중 오류가 발생했습니다.", "Something went wrong while loading your HBT history."],
    ["지갑 주소가 없습니다.", "No wallet address."],
    ["통계 조회 중 오류가 발생했습니다.", "Something went wrong while loading the stats."],

    // HBT 챌린지
    ["유효하지 않은 챌린지 단계입니다.", "This challenge level is not valid."],
    ["유효하지 않은 챌린지 티어입니다.", "This challenge tier is not valid."],
    ["유효하지 않은 챌린지입니다.", "This challenge is not valid."],
    ["이전 보상 정산이 처리 중입니다. 잠시 후 다시 시도해주세요.", "Your previous reward is still being settled. Please try again in a moment."],
    ["챌린지 ID 필요", "A challenge is required."],
    ["챌린지를 찾을 수 없습니다.", "Could not find the challenge."],
    ["해당 단계의 온체인 챌린지가 이미 진행 중입니다.", "An on-chain challenge at this level is already in progress."],
    ["HBT 예치 권한이 부족합니다. 지갑에서 예치 승인을 다시 진행해 주세요.", "Not enough HBT staking permission. Please approve the stake in your wallet again."],
    ["온체인 챌린지 예치 내역을 찾을 수 없습니다.", "Could not find the on-chain challenge stake."],
    ["챌린지 예치 내역이 서로 섞여 있어 자동 정산을 중단했습니다. 운영 확인 후 안전하게 정산됩니다.", "Your challenge stakes got mixed up, so automatic settlement was paused. We will check and settle it safely."],
    ["예치 지갑 주소가 올바르지 않습니다.", "The staking wallet address is not valid."],
    ["이미 해당 단계에서 진행 중이거나 정산할 챌린지가 있습니다.", "You already have a challenge at this level in progress or waiting to be settled."],
    ["예치 지갑 주소가 필요합니다.", "A staking wallet address is required."],
    ["로그인 계정에 연결된 지갑과 예치 지갑이 다릅니다.", "The staking wallet is different from the wallet linked to your account."],
    ["현재 챌린지 보상 정책을 불러오지 못했습니다.", "Could not load the current challenge reward policy."],
    ["온체인 예치 트랜잭션이 필요합니다.", "An on-chain staking transaction is required."],
    ["온체인 예치 승인 트랜잭션이 아직 확인되지 않았습니다.", "The on-chain staking approval has not been confirmed yet."],
    ["예치 승인 지갑이 챌린지 시작 요청과 다릅니다.", "The approving wallet is different from the one starting the challenge."],
    ["HBT 예치 승인 트랜잭션이 아닙니다.", "This is not an HBT staking approval transaction."],
    ["온체인 예치 승인을 확인하지 못했습니다.", "Could not confirm the on-chain staking approval."],
    ["이미 해당 티어에 진행 중인 챌린지가 있습니다.", "You already have a challenge in progress at this tier."],
    ["챌린지 예치를 완료하지 못했습니다.", "Could not complete the challenge stake."],
    ["수령할 보상이 없습니다.", "There is no reward to claim."],
    ["마지막 날은 임무를 완료해야 바로 수령할 수 있고, 부분 달성 정산은 다음날부터 가능합니다.", "On the last day you can claim right away only after completing it. Partial results can be settled from the next day."],
    ["온체인 챌린지 정산에 실패했습니다.", "On-chain challenge settlement failed."],
    ["오늘 HBT 일일 발행 한도를 초과해 보너스를 지금 지급할 수 없어요. 예치금은 안전하고 챌린지는 그대로 유지되니, 한도가 초기화되는 다음 날(한국시간 오전 9시) 이후 다시 수령해 주세요.", "Today's HBT issuance limit has been reached, so the bonus can't be paid now. Your stake is safe and the challenge stays as it is. Please claim again after the limit resets (9 AM Korea time)."],
    ["챌린지 보너스 지급에 실패했습니다.", "Could not pay the challenge bonus."],
    ["챌린지 보너스 지급이 완료되지 않았습니다.", "The challenge bonus has not been paid yet."],
    ["해당 티어의 챌린지를 찾을 수 없습니다.", "Could not find a challenge at this tier."],
    ["온체인 챌린지 실패 정산에 실패했습니다.", "Could not settle the failed on-chain challenge."],

    // 운동 소모임·친구 챌린지
    ["유효하지 않은 운동 소모임입니다.", "This exercise group is not valid."],
    ["weekStart, weekEnd 필수", "A week start and end are required."],
    ["days는 3 또는 7이어야 합니다.", "Days must be 3 or 7."],
    ["마무리할 소모임 기록이 없어요.", "There is no group record to wrap up."],
    ["아직 기간이 남아 있어요. 기간이 끝나거나 100일을 채우면 마무리할 수 있어요.", "There is still time left. You can wrap up when the period ends or after 100 days."],
    ["소모임, 회원, 날짜 정보가 필요합니다.", "A group, member and date are required."],
    ["승인 또는 반려 상태만 선택할 수 있습니다.", "You can only approve or reject."],
    ["확인할 제출 기록이 없습니다.", "There is no submission to review."],
    ["제출 기록 정보가 소모임과 일치하지 않습니다.", "This submission does not match the group."],
    ["소모임과 새 모임장 정보가 필요합니다.", "A group and a new leader are required."],
    ["새 모임장은 현재 참여 중인 회원이어야 합니다.", "The new leader must be a current member of the group."],
    ["친구 챌린지 신규 생성은 소모임 시스템으로 전환되어 종료되었습니다.", "New friend challenges have moved to groups and can no longer be created."],
    ["올바른 챌린지 유형을 선택해주세요.", "Please choose a valid challenge type."],
    ["초대할 친구를 선택해주세요.", "Please choose friends to invite."],
    ["기간은 3, 7, 14일 중 선택해주세요.", "Please choose 3, 7 or 14 days."],
    ["자기 자신을 초대할 수 없습니다.", "You cannot invite yourself."],
    ["1:1 경쟁은 상대 1명만 초대할 수 있습니다.", "A 1:1 match can invite only one friend."],
    ["함께 목표는 친구 2명까지만 초대할 수 있습니다.", "A group goal can invite up to two friends."],
    ["스테이크는 10P 단위로 설정해주세요.", "Please set the stake in steps of 10P."],
    ["초대 대상 유저를 찾을 수 없습니다.", "Could not find the member to invite."],
    ["챌린지는 active friendship 상태인 친구와만 만들 수 있습니다.", "You can only start a challenge with a connected friend."],
    ["이미 진행 중이거나 수락 대기 중인 친구는 새 챌린지에 다시 초대할 수 없어요.", "Friends already in a challenge, or still deciding on one, can't be invited to a new one."],
    ["수락 여부(accept) 필요", "Please accept or decline."],
    ["이미 시작되었거나 종료된 챌린지입니다.", "This challenge has already started or ended."],
    ["이미 시작되었거나 종료된 챌린지예요.", "This challenge has already started or ended."],
    ["이 챌린지에 초대되지 않았습니다.", "You were not invited to this challenge."],
    ["챌린지 초대가 만료되었습니다.", "This challenge invite has expired."],
    ["이 챌린지를 취소할 권한이 없습니다.", "You cannot cancel this challenge."],

    // 시간대·마일스톤
    ["시간대는 30일에 한 번 바꿀 수 있어요.", "You can change your time zone once every 30 days."],
    ["지원하지 않는 시간대입니다.", "This time zone is not supported."],
    ["유효하지 않은 마일스톤입니다.", "This milestone is not valid."],
    ["아직 달성하지 못한 마일스톤입니다.", "You haven't reached this milestone yet."],
    ["이미 보너스를 수령했습니다.", "You already claimed this bonus."],

    // 해빛 마켓·쿠폰
    ["쿠폰 이력을 찾을 수 없어요.", "Could not find the coupon history."],
    ["쿠폰 기록을 찾을 수 없어요.", "Could not find the coupon record."],
    ["교환할 상품을 선택해 주세요.", "Please choose an item to redeem."],
    ["선택한 보상 상품을 찾을 수 없어요.", "Could not find the item you chose."],
    ["실발급에는 쿠폰 수령 연락처가 필요해요.", "A phone number to receive the coupon is needed."],
    ["쿠폰 발급 잔액이 부족해요. 잠시 후 다시 시도해 주세요.", "Coupon issuing is temporarily out of balance. Please try again later."],
    ["소각 트랜잭션 해시가 필요합니다.", "The burn transaction hash is required."],
    ["연결된 지갑 주소를 먼저 확인해 주세요.", "Please check your connected wallet address first."],
    ["소각 트랜잭션을 확인하지 못했어요.", "Could not confirm the burn transaction."],
    ["소각 트랜잭션 발신자를 확인하지 못했어요.", "Could not confirm who sent the burn transaction."],
    ["현재 사용자 지갑과 일치하지 않는 소각 트랜잭션입니다.", "This burn transaction does not match your wallet."],
    ["HBT 컨트랙트에서 발생한 소각 트랜잭션이 아니에요.", "This burn transaction did not come from the HBT contract."],
    ["보상 마켓 정보를 불러오는 중 오류가 발생했습니다.", "Something went wrong while loading the market."],
    ["쿠폰 교환 처리 중 오류가 발생했습니다.", "Something went wrong while redeeming the coupon."],
    ["쿠폰 목록을 정리하는 중 오류가 발생했습니다.", "Something went wrong while tidying your coupons."],
    ["쿠폰 사용 완료 처리 중 오류가 발생했습니다.", "Something went wrong while marking the coupon as used."],
    ["쿠폰 삭제 중 오류가 발생했습니다.", "Something went wrong while deleting the coupon."],
    ["쿠폰 문자 재발송 중 문제가 발생했어요.", "Something went wrong while resending the coupon text."],
    ["지울 쿠폰을 다시 선택해 주세요.", "Please choose the coupon to remove again."],
    ["다른 사용자의 쿠폰 기록은 지울 수 없어요.", "You can't remove another member's coupon record."],
    ["발급 완료된 쿠폰은 보관함에서 지울 수 없어요.", "Issued coupons can't be removed from your coupon box."],
    ["사용 완료할 쿠폰을 다시 선택해 주세요.", "Please choose the coupon to mark as used again."],
    ["다른 사용자의 쿠폰은 변경할 수 없어요.", "You can't change another member's coupon."],
    ["이 쿠폰은 사용 완료로 바꿀 수 없어요.", "This coupon can't be marked as used."],
    ["삭제할 쿠폰을 다시 선택해 주세요.", "Please choose the coupon to delete again."],
    ["다른 사용자의 쿠폰은 삭제할 수 없어요.", "You can't delete another member's coupon."],
    ["사용 완료 또는 기간 만료 쿠폰만 삭제할 수 있어요.", "Only used or expired coupons can be deleted."],
    ["실발급 교환은 온체인 소각 내역이 필요해요.", "Redeeming a real coupon needs an on-chain burn record."],
    ["쿠폰 발급 응답이 불안정해 수동 확인으로 넘겼어요.", "The coupon issuer's reply was unstable, so it was passed to a manual check."],
    ["쿠폰 발급 응답이 불안정해 수동 확인 대상으로 넘겼어요.", "The coupon issuer's reply was unstable, so it was passed to a manual check."],
    ["쿠폰 이미지나 PIN을 확인하지 못해 수동 확인이 필요해요.", "Could not get the coupon image or PIN, so it needs a manual check."],
    ["쿠폰 이미지나 PIN 정보를 확인하지 못해 수동 확인이 필요해요.", "Could not get the coupon image or PIN, so it needs a manual check."],
    ["교환 요청을 다시 시작해 주세요.", "Please start the redemption again."],
    ["첫 교환 할인은 이미 사용했어요. 화면을 새로 고치면 지금 가격으로 보여드릴게요.", "You already used the first-redemption discount. Refresh to see the current price."],
    ["다시 받을 쿠폰을 선택해 주세요.", "Please choose the coupon to receive again."],
    ["문자 재발송을 사용할 수 없는 쿠폰입니다.", "This coupon can't be resent by text."],
    ["본인의 쿠폰만 다시 받을 수 있어요.", "You can only receive your own coupons again."],
    ["실발급 쿠폰만 문자로 다시 받을 수 있어요.", "Only real issued coupons can be resent by text."],
    ["사용 완료·취소·환불된 쿠폰은 다시 받을 수 없어요.", "Used, cancelled or refunded coupons can't be received again."],
    ["공급사 거래번호나 수신 연락처를 확인할 수 없어요.", "Could not find the supplier's order number or the receiving phone number."],
    ["재발송 후 5분 뒤에 다시 시도해 주세요.", "Please try again 5 minutes after the last resend."],
    ["문자 재발송은 하루 3회까지 가능합니다.", "You can resend by text up to 3 times a day."],
    ["발송사에서 이 쿠폰의 재발송을 거절했어요. 이미 사용했거나 기간이 지난 쿠폰일 수 있어요. 계속 문제가 있으면 문의해 주세요.", "The sender declined to resend this coupon. It may already be used or expired. Contact us if the problem continues."],
    ["문자 재발송 요청이 지연되고 있어요. 잠시 후 다시 시도해 주세요.", "The resend request is taking a while. Please try again in a moment."],
    ["확인할 쿠폰을 선택해 주세요.", "Please choose the coupon to check."],
    ["본인의 쿠폰만 확인할 수 있어요.", "You can only check your own coupons."],
    ["재확인할 쿠폰을 선택해 주세요.", "Please choose the coupon to check again."],
    ["쿠폰 PIN은 주문번호가 아니에요. 주문번호를 모르면 비워 두세요.", "A coupon PIN is not an order number. Leave it blank if you don't know the order number."],
    ["주문번호 형식이 아니에요. 확인이 어려우면 비워 두세요.", "This is not an order number. Leave it blank if you're not sure."],
    ["정정할 쿠폰을 선택해 주세요.", "Please choose the coupon to correct."],
    ["발급 대기·실패 상태의 쿠폰만 정정할 수 있어요.", "Only pending or failed coupons can be corrected."],
    ["이미 환불된 건은 발급완료로 정정할 수 없어요.", "A refunded coupon can't be corrected to issued."],
    ["공급사 발송·발행 확인이 없는 건이에요. 먼저 쿠폰 재조회로 확인하거나, 공급사에서 확인한 주문번호를 입력해 주세요.", "The supplier hasn't confirmed sending or issuing this one. Check it again first, or enter the order number confirmed with the supplier."],
    ["환불할 쿠폰을 선택해 주세요.", "Please choose the coupon to refund."],
    ["회원 정보가 없어 환불할 수 없어요.", "Can't refund: the member could not be found."],
    ["발급 대기·실패 상태의 쿠폰만 환불할 수 있어요.", "Only pending or failed coupons can be refunded."],
    ["이미 환불되었거나 차감 내역이 없어요.", "Already refunded, or nothing was deducted."],
    ["환불 처리에 실패했어요(이미 처리되었을 수 있어요).", "The refund failed (it may already be done)."],
    ["현재는 쿠폰 발급이 잠시 어려워요.", "Coupons can't be issued right now."],
    // 교환 불가 사유(buildIssuancePolicy·buildCatalogAvailability). 상품 칸 아래 안내로 나간다(E6-3).
    ["가격 기준이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.", "Prices aren't ready yet. Please try again in a moment."],
    ["Giftishow 연동 설정이 비어 있어요.", "Coupon issuing isn't set up yet."],
    ["비즈머니 확인이 불안정해 쿠폰 발급을 잠시 멈췄어요.", "Coupon issuing is paused for a moment while we check our balance."],
    ["현재 재고 확인이 필요해요.", "Stock needs to be checked first."],
    ["오늘 교환 한도를 모두 사용했어요.", "Today's redemption limit has been used up."],
    ["이번 주 교환 한도를 모두 사용했어요.", "This week's redemption limit has been used up."],
    ["이번 달 교환 한도를 모두 사용했어요.", "This month's redemption limit has been used up."],
    ["지금은 이 쿠폰을 교환할 수 없어요. 잠시 후 다시 시도해 주세요.", "This coupon can't be redeemed right now. Please try again later."],
    ["현재는 이 쿠폰을 발급할 수 없어요.", "This coupon can't be issued right now."],

    // 배지·투표
    ["해외 기프트카드 투표는 해외 시간대 회원만 할 수 있어요.", "Only members in an overseas time zone can vote on overseas gift cards."],
    ["고를 수 없는 배지예요.", "This badge can't be chosen."],
    ["아직 이 배지의 활동 기준을 넘지 않았어요.", "You haven't reached this badge's activity goal yet."],
    ["포인트가 모자라요.", "Not enough points."],
    ["가진 배지만 대표로 달 수 있어요.", "You can only display a badge you own."],

    // 관제탑 쪽(회원 화면에는 나가지 않지만 문장 검사를 한 자리에서 하려고 같이 둔다)
    ["쿠폰 발급 정보를 확인하는 중 문제가 발생했어요.", "Something went wrong while checking the coupon issue."],
    ["쿠폰 재확인 처리 중 문제가 발생했어요.", "Something went wrong while re-checking the coupon."],
    ["발급완료 정정 중 오류가 발생했어요.", "Something went wrong while correcting it to issued."],
    ["환불 처리 중 오류가 발생했어요.", "Something went wrong during the refund."],
    ["대상 사용자(uid)가 필요합니다.", "A target member (uid) is required."],
    ["날짜 형식이 올바르지 않습니다(YYYY-MM-DD).", "The date format is wrong (YYYY-MM-DD)."],
    ["보상 마켓 운영 상태를 갱신하지 못했어요.", "Could not update the market status."],
    ["대상 회원을 선택해 주세요.", "Please choose a member."],
    ["코멘트를 입력해 주세요.", "Please write a comment."],
    ["요약은 60자를 넘을 수 없습니다.", "The summary can't be longer than 60 characters."],
    ["대상 회원을 찾을 수 없습니다.", "Could not find that member."],
    ["todayStr 형식이 올바르지 않습니다.", "The date (todayStr) format is wrong."],
    ["혈액검사 품질 통계를 불러오지 못했습니다.", "Could not load the blood test quality stats."],
    ["유효하지 않은 월 형식입니다. (YYYY-MM)", "The month format is not valid (YYYY-MM)."],
    ["maxGapDays는 minGapDays보다 커야 합니다.", "maxGapDays must be larger than minGapDays."],
    ["초안 종류가 올바르지 않습니다.", "The draft type is not valid."],

    // 공유 올리기·오류 제보
    ["잘못된 공유 id 입니다.", "This share id is not valid."],
    ["무슨 일이 있었는지 조금만 더 적어 주세요.", "Please tell us a little more about what happened."]
]);

// 숫자가 끼는 문장. 한국어 원문(서버가 채워 넣은 뒤의 글)에 맞춘다.
const PATTERNS = [
    [/^챌린지 참가는 최근 30일 내 ([\d,]+)일 이상 기록이 필요합니다\.$/, (m) => `To join a challenge, you need logs on at least ${m[1]} of the last 30 days.`],
    [/^(.+) 교환에 필요한 HBT 소각량이 확인되지 않았어요\.$/, (m) => `Could not confirm the HBT burn needed to redeem ${m[1]}.`],
    [/^최소 ([\d,]+)P 이상 필요합니다\.$/, (m) => `At least ${m[1]}P is required.`],
    [/^포인트가 부족합니다\. 필요: ([\d,]+)P, 보유: ([\d,]+)P$/, (m) => `Not enough points. Needed: ${m[1]}P, you have: ${m[2]}P`],
    [/^최소 ([\d,.]+) HBT 이상 예치해야 합니다\.$/, (m) => `You need to stake at least ${m[1]} HBT.`],
    [/^최대 ([\d,.]+) HBT까지만 예치 가능합니다\.$/, (m) => `You can stake up to ${m[1]} HBT.`],
    [/^오늘 HBT 일일 발행 한도가 남지 않아 보너스를 지금 지급할 수 없어요 \(필요 ([\d,.]+) HBT, 남은 한도 ([\d,.]+) HBT\)\. 예치금은 안전하고 챌린지는 그대로 유지되니, 한도가 초기화되는 다음 날\(한국시간 오전 9시\) 이후 다시 수령해 주세요\.$/,
        (m) => `Today's HBT issuance limit is used up, so the bonus can't be paid now (needed ${m[1]} HBT, left ${m[2]} HBT). Your stake is safe and the challenge stays as it is. Please claim again after the limit resets (9 AM Korea time).`],
    [/^스테이크는 10~([\d,]+)P 사이여야 합니다\.$/, (m) => `The stake must be between 10 and ${m[1]}P.`],
    [/^([\d,]+) HBT 이상 상품만 교환할 수 있어요\.$/, (m) => `Only items of ${m[1]} HBT or more can be redeemed.`],
    [/^([\d,]+)P 이상 상품만 교환할 수 있어요\.$/, (m) => `Only items of ${m[1]}P or more can be redeemed.`],
    [/^포인트가 부족해요\. 현재 ([\d,]+)P예요\.$/, (m) => `Not enough points. You have ${m[1]}P.`],
    // 빠진 설정 이름은 회원에게 쓸모가 없다.
    [/^Giftishow 연동 설정이 비어 있어요: .*$/, () => "Coupon issuing isn't set up yet."],
    [/^코멘트는 ([\d,]+)자 이내로 입력해 주세요\.$/, (m) => `Please keep the comment within ${m[1]} characters.`],
    [/^온체인 예치 확인에 실패해 정리를 중단했습니다:\s*(.*)$/, (m) => `Could not check the on-chain stake, so the cleanup stopped: ${m[1]}`],
    [/^이 티어에 온체인 예치\(([\d,.]+) HBT\)가 아직 잠겨 있어 정리할 수 없습니다\. 온체인 정산이 먼저 필요합니다\.$/, (m) => `${m[1]} HBT is still staked on-chain at this tier, so it can't be cleaned up. Settle on-chain first.`]
];

function englishForErrorMessage(message) {
    const text = String(message || "").trim();
    if (!text || !HANGUL.test(text)) return "";
    if (EXACT.has(text)) return EXACT.get(text);
    for (const [pattern, render] of PATTERNS) {
        const match = text.match(pattern);
        if (match) return render(match);
    }
    return "";
}

/**
 * 서버가 한국어로 만든 안내(오류가 아닌 것 — 교환 불가 사유 등)에 붙일 다른 언어 글.
 * 화면은 js/i18n.js localizedServerText 로 고른다. 없으면 null.
 */
function localizedServerText(text) {
    const en = englishForErrorMessage(text);
    return en ? { en } : null;
}

function withErrorTranslations(error) {
    if (!(error instanceof HttpsError)) return error;
    const en = englishForErrorMessage(error.message);
    if (!en) return error;
    const details = error.details;
    let nextDetails;
    if (details === undefined || details === null) nextDetails = { en };
    else if (typeof details === "object" && !Array.isArray(details)) {
        if (details.en) return error;
        nextDetails = { ...details, en };
    } else nextDetails = { value: details, en };
    return new HttpsError(error.code, error.message, nextDetails);
}

/** 콜러블 처리 함수를 감싸, 던진 HttpsError 에 영어를 싣는다. */
function localizeCallable(handler) {
    return async (request) => {
        try {
            return await handler(request);
        } catch (error) {
            throw withErrorTranslations(error);
        }
    };
}

/** onCall 과 같은 모양. (opts, handler) 와 (handler) 둘 다 받는다. */
function localizedOnCall(baseOnCall) {
    return (optsOrHandler, maybeHandler) => (typeof optsOrHandler === "function"
        ? baseOnCall(localizeCallable(optsOrHandler))
        : baseOnCall(optsOrHandler, localizeCallable(maybeHandler)));
}

module.exports = {
    EXACT,
    PATTERNS,
    englishForErrorMessage,
    localizedServerText,
    withErrorTranslations,
    localizeCallable,
    localizedOnCall,
};

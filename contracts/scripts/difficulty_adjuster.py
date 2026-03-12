"""
HaBit (HBT) 난이도 조절 스크립트
=================================

주 1회 실행하여 P:HBT 교환 비율(Rate)을 계산하고,
스마트 컨트랙트의 updateRate() 함수를 통해 온체인에 갱신합니다.

기본 계산식:
    새로운 비율 = 현재 비율 × (주간 채굴 목표량 / 지난 7일간 실제 총 채굴량)

제한 조건:
    1. 상한선(Max Cap): 최대 1P = 4 HBT (절대 초과 불가)
    2. 변동폭 제한(Smoothing):
       - 상승: 최대 2.0배
       - 하락: 최소 0.5배
    3. 최소 비율: 10^-8 HBT/P (실질적 0 방지)

Phase 구조 (통합 채굴 풀 7,000만 HBT 기준):
    Phase 1: 0 ~ 3,500만 HBT → 주간 목표 140,000 HBT
    Phase 2: 3,500만 ~ 5,250만 HBT → 주간 목표 70,000 HBT
    Phase 3: 5,250만 ~ 6,125만 HBT → 주간 목표 35,000 HBT
    이후: 남은 물량의 절반 단위로 무한 반감
"""

from decimal import Decimal, ROUND_HALF_UP

# ============ 상수 ============

# 온체인 비율 스케일링 (8 decimals, 컨트랙트의 RATE_SCALE과 동일)
RATE_SCALE = 10 ** 8

# 비율 제한
MAX_RATE = 4.0           # 1P = 최대 4 HBT
MIN_RATE = 1e-8          # 1P = 최소 0.00000001 HBT (실질적 0 방지)

# 변동폭 제한 (Smoothing)
MAX_RATE_MULTIPLIER = 2.0   # 최대 2배 상승
MIN_RATE_MULTIPLIER = 0.5   # 최소 절반 하락

# 통합 채굴 풀
MINING_POOL = 70_000_000  # HBT 단위

# Phase 구간 경계 (누적 채굴량, HBT 단위)
PHASE1_END = 35_000_000
PHASE2_END = 52_500_000
PHASE3_END = 61_250_000

# Phase별 주간 목표 (HBT 단위)
PHASE1_WEEKLY_TARGET = 140_000
PHASE2_WEEKLY_TARGET = 70_000
PHASE3_WEEKLY_TARGET = 35_000


def get_phase_and_weekly_target(total_mined_hbt: float) -> tuple:
    """
    누적 채굴량 기반으로 현재 Phase와 주간 채굴 목표량을 결정합니다.

    Args:
        total_mined_hbt: 채굴 풀에서 누적 발행된 HBT (HBT 단위, not raw units)

    Returns:
        (phase: int, weekly_target: float) 튜플
    """
    if total_mined_hbt < PHASE1_END:
        return (1, PHASE1_WEEKLY_TARGET)
    elif total_mined_hbt < PHASE2_END:
        return (2, PHASE2_WEEKLY_TARGET)
    elif total_mined_hbt < PHASE3_END:
        return (3, PHASE3_WEEKLY_TARGET)
    else:
        # Phase 3 이후: 무한 반감
        remaining = MINING_POOL - PHASE3_END
        extra_mined = total_mined_hbt - PHASE3_END
        target = float(PHASE3_WEEKLY_TARGET)
        threshold = remaining / 2.0
        phase = 4

        while extra_mined >= threshold and threshold > 0:
            extra_mined -= threshold
            threshold /= 2.0
            target /= 2.0
            phase += 1

        # 최소 목표량 보장
        if target < 1.0:
            target = 1.0

        return (phase, target)


def calculate_new_rate(
    current_rate: float,
    last_7_days_minted_hbt: float,
    total_mined_hbt: float,
) -> dict:
    """
    새로운 P:HBT 교환 비율을 계산합니다.

    Args:
        current_rate: 현재 비율 (예: 1.0 = 1P → 1 HBT)
        last_7_days_minted_hbt: 지난 7일간 실제 채굴량 (HBT 단위)
        total_mined_hbt: 채굴 풀에서 누적 발행된 HBT (Phase 판별용)

    Returns:
        dict: {
            'new_rate': float,           # 새 비율 (HBT per P)
            'new_rate_scaled': int,       # 온체인 형식 (rate × 10^8)
            'phase': int,                 # 현재 Phase
            'weekly_target': float,       # 주간 목표량 (HBT)
            'adjustment_ratio': float,    # 실제 적용된 조정 배수
            'raw_ratio': float,           # 원본 조정 배수 (제한 적용 전)
            'clamped': bool,              # 제한 적용 여부
            'clamp_reason': str,          # 제한 사유 (있을 경우)
        }
    """
    if current_rate <= 0:
        raise ValueError("current_rate must be positive")
    if total_mined_hbt < 0:
        raise ValueError("total_mined_hbt must be non-negative")

    # 1) Phase 및 주간 목표 결정
    phase, weekly_target = get_phase_and_weekly_target(total_mined_hbt)

    # 2) 조정 비율 계산
    if last_7_days_minted_hbt <= 0:
        # 채굴 없음 → 최대 상승 (사용자 유입 촉진)
        raw_ratio = MAX_RATE_MULTIPLIER
    else:
        raw_ratio = weekly_target / last_7_days_minted_hbt

    # 3) 변동폭 제한 (Smoothing)
    clamped = False
    clamp_reason = ""
    adjustment_ratio = raw_ratio

    if adjustment_ratio > MAX_RATE_MULTIPLIER:
        adjustment_ratio = MAX_RATE_MULTIPLIER
        clamped = True
        clamp_reason = f"상승 제한 ({raw_ratio:.4f}x → {MAX_RATE_MULTIPLIER}x)"
    elif adjustment_ratio < MIN_RATE_MULTIPLIER:
        adjustment_ratio = MIN_RATE_MULTIPLIER
        clamped = True
        clamp_reason = f"하락 제한 ({raw_ratio:.4f}x → {MIN_RATE_MULTIPLIER}x)"

    # 4) 새 비율 계산
    new_rate = current_rate * adjustment_ratio

    # 5) 상한선 적용
    if new_rate > MAX_RATE:
        new_rate = MAX_RATE
        clamped = True
        clamp_reason = f"상한선 적용 (→ {MAX_RATE} HBT/P)"

    # 6) 최소값 보장 (0 방지)
    if new_rate < MIN_RATE:
        new_rate = MIN_RATE
        clamped = True
        clamp_reason = f"하한선 적용 (→ {MIN_RATE} HBT/P)"

    # 7) 온체인 형식 변환 (Decimal 사용으로 부동소수점 오차 방지)
    new_rate_decimal = Decimal(str(new_rate))
    new_rate_scaled = int(
        (new_rate_decimal * Decimal(str(RATE_SCALE))).to_integral_value(
            rounding=ROUND_HALF_UP
        )
    )
    # 최소 1 (온체인에서 0은 revert)
    if new_rate_scaled < 1:
        new_rate_scaled = 1

    return {
        "new_rate": round(new_rate, 8),
        "new_rate_scaled": new_rate_scaled,
        "phase": phase,
        "weekly_target": weekly_target,
        "adjustment_ratio": round(adjustment_ratio, 6),
        "raw_ratio": round(raw_ratio, 6),
        "clamped": clamped,
        "clamp_reason": clamp_reason,
    }


# ============ CLI 실행 ============

if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(
        description="HaBit 난이도 조절 — 새로운 P:HBT 교환 비율 계산"
    )
    parser.add_argument(
        "--current-rate",
        type=float,
        required=True,
        help="현재 비율 (예: 1.0 = 1P → 1 HBT)",
    )
    parser.add_argument(
        "--minted-7d",
        type=float,
        required=True,
        help="지난 7일간 실제 채굴량 (HBT 단위)",
    )
    parser.add_argument(
        "--total-mined",
        type=float,
        required=True,
        help="채굴 풀에서 누적 발행된 HBT (Phase 판별용)",
    )

    args = parser.parse_args()

    result = calculate_new_rate(
        current_rate=args.current_rate,
        last_7_days_minted_hbt=args.minted_7d,
        total_mined_hbt=args.total_mined,
    )

    print("\n" + "=" * 50)
    print("HaBit 난이도 조절 결과")
    print("=" * 50)
    print(f"  Phase:             {result['phase']}")
    print(f"  주간 목표:         {result['weekly_target']:,.0f} HBT")
    print(f"  조정 배수:         {result['adjustment_ratio']}x", end="")
    if result["clamped"]:
        print(f"  ⚠️  {result['clamp_reason']}")
    else:
        print()
    print(f"  기존 비율:         {args.current_rate} HBT/P")
    print(f"  새 비율:           {result['new_rate']} HBT/P")
    print(f"  온체인 값:         {result['new_rate_scaled']}")
    print("=" * 50)
    print(f"\n📋 updateRate() 호출 파라미터: {result['new_rate_scaled']}")
    print(f"\n📦 JSON 출력:")
    print(json.dumps(result, indent=2, ensure_ascii=False))

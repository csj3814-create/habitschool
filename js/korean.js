// 한국어 조사. 이름 뒤에 붙는 글자는 앞 글자의 받침이 정한다.
//
// 2026-09-21 지적: "조사에 오타 있다. 5주 연속 배지를 이라고 하던지."
// 배지 안내가 "주간 달성를 얻었어요", "3주 연속를 얻었어요" 로 나가고 있었다.
// 받침이 있으면 '을', 없으면 '를' 인데 코드가 '를' 로 못 박혀 있었다.
//
// 관제탑(js/admin-utils.js)에 같은 함수가 있었지만, 회원 앱이 그것을 쓰자고
// 처방 엔진 전체를 들여올 수는 없다. 두 벌로 만들면 갈라지므로 여기로 옮기고
// 양쪽이 이 파일을 쓴다.

const JOSA_TAIL_HAS_BATCHIM = {
    "kg": true, "mg": true, "mg/dL": false, "mmHg": false, "%": false, "kcal": false,
    "0": false, "1": true, "2": false, "3": true, "4": false,
    "5": false, "6": true, "7": true, "8": true, "9": false,
};

export function lastSoundHasBatchim(text) {
    const value = String(text ?? "").trim();
    if (!value) return null;

    // 단위가 붙어 있으면 그 단위의 소리로 판단한다.
    for (const unit of ["mg/dL", "mmHg", "kcal", "kg", "mg", "%"]) {
        if (value.endsWith(unit)) return JOSA_TAIL_HAS_BATCHIM[unit];
    }

    const last = value[value.length - 1];
    const code = last.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
        const jongseong = (code - 0xAC00) % 28;
        if (jongseong === 0) return false;
        // ㄹ 받침은 '로' 를 쓴다. '레벨로', '1일로'.
        if (jongseong === 8) return "rieul";
        return true;
    }
    if (last >= "0" && last <= "9") return JOSA_TAIL_HAS_BATCHIM[last];
    return null;
}

/** 조사를 붙인 문자열. 판단할 수 없으면 받침 있는 쪽으로 붙인다. */
export function withJosa(text, kind) {
    const value = String(text ?? "");
    const batchim = lastSoundHasBatchim(value);
    const pairs = {
        이가: ["가", "이", "이"],
        은는: ["는", "은", "은"],
        으로: ["로", "으로", "로"],
        을를: ["를", "을", "을"],
    };
    const [none, has, rieul] = pairs[kind] || pairs.이가;
    if (batchim === "rieul") return value + rieul;
    if (batchim === false) return value + none;
    return value + has;
}

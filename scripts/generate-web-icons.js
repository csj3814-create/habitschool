// 웹 대표 로고(앱 아이콘)를 만든다.   node scripts/generate-web-icons.js
//
// 2026-10-21 대표: "세계용 앱으로 거듭나니 대표 로고를 한글 '해빛스쿨' 글자가 없는, 안드로이드 앱에서 쓰는 아이콘으로 바꾸자."
// 안드로이드 런처 아이콘은 주황 방사형 배경(#FFD54F → #FF9800, drawable/ic_launcher_background.xml) 위에
// 해 그림만 있다(mipmap-nodpi/ic_launcher_foreground_actual.png, icons/generate_app_icons.py). 웹도 같은 그림을 쓴다.
// 해 그림은 예전 icons/icon-512.svg 와 같은 좌표다. 글자를 빼고 해를 가운데(256,256)로 옮겼다.
//
// 옛 파일(icon-192/512.svg·png, apple-touch-icon.svg)은 지우지 않는다. 바깥(메일·메신저 미리보기)이 그 주소를
// 들고 있을 수 있다. 같은 주소에 새 그림을 덮어쓰면 휴대폰이 옛 그림을 계속 보여 주므로(교훈 2026-09-30) 새 이름으로 만든다.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'icons');

function rays() {
    const spikes = [0, 45, 90, 135, 180, 225, 270, 315]
        .map((deg) => `        <polygon points="0,-230 20,-155 -20,-155" transform="rotate(${deg})"/>`).join('\n');
    const petals = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]
        .map((deg) => `        <ellipse cx="0" cy="-190" rx="14" ry="35" transform="rotate(${deg})"/>`).join('\n');
    return `      <g fill="#FFF3E0" opacity="0.7">\n${spikes}\n      </g>\n      <g fill="#FFCC80" opacity="0.5">\n${petals}\n      </g>`;
}

/**
 * @param {object} o
 * @param {number} o.radius 모서리 둥글기(512 기준). 0 이면 꽉 찬 정사각형(마스크는 기기가 씌운다).
 * @param {number} o.sunScale 해 그림 크기. 1 이면 광선 끝이 지름 460(512 의 90%).
 */
function buildSvg({ radius, sunScale }) {
    const clip = radius > 0
        ? `    <clipPath id="roundedClip">\n      <rect width="512" height="512" rx="${radius}" ry="${radius}"/>\n    </clipPath>\n`
        : '';
    const open = radius > 0 ? '  <g clip-path="url(#roundedClip)">' : '  <g>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- 해빛스쿨 앱 아이콘. scripts/generate-web-icons.js 가 만든다 — 손으로 고치지 않는다. -->
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFD54F"/>
      <stop offset="100%" stop-color="#FF9800"/>
    </radialGradient>
    <radialGradient id="face" cx="50%" cy="45%" r="40%">
      <stop offset="0%" stop-color="#FFEE58"/>
      <stop offset="100%" stop-color="#FFB300"/>
    </radialGradient>
${clip}  </defs>
${open}
    <rect width="512" height="512" fill="url(#bg)"/>
    <g transform="translate(256,256) scale(${sunScale}) translate(-256,-250)">
    <g transform="translate(256,250)">
${rays()}
    </g>
    <circle cx="256" cy="250" r="130" fill="url(#face)" stroke="#F9A825" stroke-width="4"/>
    <circle cx="188" cy="282" r="26" fill="#FF8A65" opacity="0.35"/>
    <circle cx="324" cy="282" r="26" fill="#FF8A65" opacity="0.35"/>
    <ellipse cx="218" cy="235" rx="13" ry="16" fill="#5D4037"/>
    <ellipse cx="294" cy="235" rx="13" ry="16" fill="#5D4037"/>
    <circle cx="222" cy="229" r="5" fill="white" opacity="0.8"/>
    <circle cx="298" cy="229" r="5" fill="white" opacity="0.8"/>
    <path d="M224,276 Q256,310 288,276" fill="none" stroke="#5D4037" stroke-width="6" stroke-linecap="round"/>
    </g>
  </g>
</svg>
`;
}

// 화면 안 로고·파비콘·"any" 아이콘: 지금 아이콘처럼 둥근 모서리, 해는 크게.
const ROUNDED = buildSvg({ radius: 100, sunScale: 1 });
// maskable(안드로이드 홈 화면 PWA): 기기가 원·둥근 사각으로 자른다. 안전 영역(가운데 지름 80%) 안에 해가 다 들도록 줄인다.
// 안드로이드 런처 전경과 같은 비율(70/108)이다.
const MASKABLE = buildSvg({ radius: 0, sunScale: (512 * 70 / 108) / 460 });
// iOS 홈 화면: iOS 가 모서리를 깎으므로 꽉 찬 정사각형, 해는 조금 줄인다.
const APPLE = buildSvg({ radius: 0, sunScale: 0.86 });

async function png(svg, size, name) {
    await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
    console.log(`  ${name} (${size}px)`);
}

async function main() {
    fs.writeFileSync(path.join(OUT, 'app-icon.svg'), ROUNDED);
    console.log('  app-icon.svg');
    await png(ROUNDED, 192, 'app-icon-192.png');
    await png(ROUNDED, 512, 'app-icon-512.png');
    await png(MASKABLE, 192, 'app-icon-maskable-192.png');
    await png(MASKABLE, 512, 'app-icon-maskable-512.png');
    await png(APPLE, 180, 'app-icon-apple-180.png');
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { buildSvg };

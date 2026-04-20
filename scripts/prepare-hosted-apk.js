const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const androidDir = path.join(repoRoot, "android");
const installDir = path.join(repoRoot, "install");
const localPropertiesPath = path.join(androidDir, "local.properties");
const debugApkPath = path.join(
  repoRoot,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "debug",
  "app-debug.apk"
);
const releaseApkPath = path.join(
  repoRoot,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk"
);
const releaseSigningPropertiesPath = path.join(androidDir, "release-signing.properties");
const releaseSigningLocalPropertiesPath = path.join(androidDir, "release-signing.local.properties");

function log(message) {
  process.stdout.write(`[prepare-hosted-apk] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[prepare-hosted-apk] ${message}\n`);
  process.exit(1);
}

function hasAnyReleaseSigningHints() {
  return fs.existsSync(releaseSigningPropertiesPath)
    || fs.existsSync(releaseSigningLocalPropertiesPath)
    || Boolean(process.env.HABITSCHOOL_ANDROID_STORE_FILE)
    || Boolean(process.env.HABITSCHOOL_ANDROID_STORE_PASSWORD)
    || Boolean(process.env.HABITSCHOOL_ANDROID_KEY_ALIAS)
    || Boolean(process.env.HABITSCHOOL_ANDROID_KEY_PASSWORD);
}

function runGradleDebugBuild() {
  if (!fs.existsSync(localPropertiesPath)) {
    fail(
      "android/local.properties가 없어 debug APK를 빌드할 수 없습니다. worktree 배포라면 먼저 local.properties를 복사해 주세요."
    );
  }

  log("debug APK가 없어 Android debug 빌드를 시작합니다.");
  const result =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          ["/d", "/s", "/c", "gradlew.bat :app:assembleDebug"],
          {
            cwd: androidDir,
            stdio: "inherit",
          }
        )
      : spawnSync("./gradlew", [":app:assembleDebug"], {
          cwd: androidDir,
          stdio: "inherit",
        });

  if (result.status !== 0) {
    fail("Android debug APK 빌드에 실패했습니다.");
  }
}

function ensureSourceApk() {
  const hasReleaseSigning = hasAnyReleaseSigningHints();

  if (hasReleaseSigning && fs.existsSync(releaseApkPath)) {
    log("release APK를 사용합니다.");
    return releaseApkPath;
  }

  if (!hasReleaseSigning && fs.existsSync(releaseApkPath)) {
    log("release APK가 있지만 현재 signing 힌트가 없어 stale artifact로 보고 무시합니다.");
  }

  if (hasReleaseSigning) {
    log("release signing 힌트는 있지만 release APK가 없어 debug APK로 계속 진행합니다.");
  }

  if (fs.existsSync(debugApkPath)) {
    log("debug APK를 사용합니다.");
    return debugApkPath;
  }

  runGradleDebugBuild();

  if (!fs.existsSync(debugApkPath)) {
    fail(`빌드 후에도 APK를 찾지 못했습니다: ${debugApkPath}`);
  }

  return debugApkPath;
}

function copyToHostedInstallPath() {
  const sourceApkPath = ensureSourceApk();
  fs.mkdirSync(installDir, { recursive: true });

  const targets = [
    path.join(installDir, "android.apk"),
    path.join(installDir, "android-debug.apk"),
  ];

  for (const targetPath of targets) {
    fs.copyFileSync(sourceApkPath, targetPath);
    const stats = fs.statSync(targetPath);
    if (!stats.size) {
      fail(`복사된 APK 크기가 0입니다: ${targetPath}`);
    }
    log(`준비 완료: ${path.relative(repoRoot, targetPath)} (${stats.size} bytes)`);
  }
}

function main() {
  copyToHostedInstallPath();
}

if (require.main === module) {
  main();
}

module.exports = {
  ensureSourceApk,
  hasAnyReleaseSigningHints,
};

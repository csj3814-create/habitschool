const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const androidDir = path.join(repoRoot, "android");
const installDir = path.join(repoRoot, "install");
const localPropertiesPath = path.join(androidDir, "local.properties");
const sourceApkPath = path.join(
  repoRoot,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "debug",
  "app-debug.apk"
);

function log(message) {
  process.stdout.write(`[prepare-hosted-apk] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[prepare-hosted-apk] ${message}\n`);
  process.exit(1);
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
  if (fs.existsSync(sourceApkPath)) {
    return;
  }

  runGradleDebugBuild();

  if (!fs.existsSync(sourceApkPath)) {
    fail(`빌드 후에도 APK를 찾지 못했습니다: ${sourceApkPath}`);
  }
}

function copyToHostedInstallPath() {
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
  ensureSourceApk();
  copyToHostedInstallPath();
}

main();

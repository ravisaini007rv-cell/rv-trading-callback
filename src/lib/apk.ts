import type { ProjectFile } from "./project";

/**
 * Turn the static web project into a Capacitor Android app plus a GitHub Actions
 * workflow that builds a real, installable APK on GitHub's free runners.
 *
 * The user never installs Android Studio: push the ZIP to a repo, and the
 * Actions tab produces an APK artifact.
 */
export function androidBundle(
  files: ProjectFile[],
  opts: { appName: string; appId: string },
): ProjectFile[] {
  const { appName, appId } = opts;
  const safeName = appName.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "RV App";

  const www: ProjectFile[] = files.map((f) => ({
    path: `www/${f.path}`,
    content: f.content,
  }));

  return [
    ...www,
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: safeName.toLowerCase().replace(/\s+/g, "-"),
          version: "1.0.0",
          private: true,
          scripts: {
            "android:add": "npx cap add android",
            "android:sync": "npx cap sync android",
          },
          devDependencies: {
            "@capacitor/cli": "^6.2.0",
          },
          dependencies: {
            "@capacitor/core": "^6.2.0",
            "@capacitor/android": "^6.2.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "capacitor.config.json",
      content: JSON.stringify(
        {
          appId,
          appName: safeName,
          webDir: "www",
          server: { androidScheme: "https" },
        },
        null,
        2,
      ),
    },
    {
      path: ".github/workflows/build-apk.yml",
      content: `name: Build Android APK

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21

      - name: Install dependencies
        run: npm install

      - name: Add Android platform
        run: npx cap add android

      - name: Sync web assets
        run: npx cap sync android

      - name: Build debug APK
        working-directory: android
        run: |
          chmod +x gradlew
          ./gradlew assembleDebug --no-daemon

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: ${safeName.replace(/\s+/g, "-")}-apk
          path: android/app/build/outputs/apk/debug/*.apk
`,
    },
    {
      path: ".gitignore",
      content: "node_modules/\nandroid/\n.DS_Store\n",
    },
    {
      path: "BUILD-APK.md",
      content: `# Build your APK — free, no Android Studio

Your web app is in \`www/\`. GitHub builds the APK for you on free runners.

## Steps

1. Create a new **public** repo on GitHub (free Actions minutes are unlimited for public repos).
2. Upload everything in this folder to that repo (drag-and-drop on github.com works).
3. Open the **Actions** tab. The *Build Android APK* workflow starts automatically —
   if not, click it and press **Run workflow**.
4. Wait ~5 minutes. Open the finished run and download the
   **${safeName.replace(/\s+/g, "-")}-apk** artifact.
5. Unzip it, copy the \`.apk\` to your phone, and install it
   (enable *Install unknown apps* for your file manager).

## App details

- Name: **${safeName}**
- Package id: \`${appId}\`

Change these in \`capacitor.config.json\` before you push.

## Play Store

The workflow makes a **debug** APK — perfect for testing and sharing directly.
For the Play Store you need a signed release build: generate a keystore, add it to the
repo as GitHub *Secrets*, and swap \`assembleDebug\` for \`bundleRelease\`.
A Play Console developer account is a one-time \\$25 fee.

## Build locally instead (optional)

\`\`\`bash
npm install
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
\`\`\`
`,
    },
  ];
}

export function defaultAppId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20) || "myapp";
  return `com.rv.${slug}`;
}

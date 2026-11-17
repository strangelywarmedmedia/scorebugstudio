# Releasing Scorebug Studio

How to turn your changes into downloadable Windows and Mac installers. You never build anything by hand:
GitHub builds the installers for you when you publish a release.

**What gets built** (about 10-15 minutes, free for private repos within GitHub's monthly Actions allowance):

| File | For |
|---|---|
| `ScorebugStudio-Setup-<version>.exe` | Windows installer |
| `ScorebugStudio-<version>-mac-arm64.dmg` | Macs with Apple Silicon (M1 and newer) |
| `ScorebugStudio-<version>-mac-intel.dmg` | Older Intel Macs |
| `com.scorebugstudio.controller.streamDeckPlugin` | Stream Deck plugin |

---

## One-time setup

### 1. Get the repository on your computer (GitHub Desktop)
1. Install **GitHub Desktop** from https://desktop.github.com and sign in with your GitHub account.
2. **File -> Clone repository**, choose your `scorebug-studio` repo, pick a folder (for example `Documents/GitHub`), click **Clone**.
3. Click **Show in Finder / Show in Explorer** to open the cloned folder.

### 2. Put the new files in
1. Unzip `scorebug-studio-repo.zip`. Inside is a `scorebug-studio` folder.
2. In your cloned folder, **delete everything except the hidden `.git` folder** (you may not see it - leave it alone).
   This removes the old layout.
3. Copy **everything from inside the unzipped `scorebug-studio` folder** into the cloned folder. The result should look like:

```
scorebug-studio/            <- your cloned repo
  .github/workflows/release.yml
  docs/RELEASING.md
  packaging/
  streamdeck-plugin/
  web/
  scorebug_app.py
  scorebug_server.py
  requirements.txt
  CHANGELOG.md
  README.md
  ...
```
   Mac Finder hides folders that start with a dot. Press **Cmd + Shift + .** in Finder to show them so `.github` gets copied.

### 3. Upload (commit and push)
1. Back in GitHub Desktop you'll see all the changes listed on the left.
2. Bottom left: type a summary such as `Add installers, tray launcher and release workflow`, click **Commit to main**.
3. Click **Push origin** (top bar).
4. On github.com open your repo, then the **Actions** tab. If GitHub asks, click **I understand my workflows, go ahead and enable them**.

### 4. Check your repo has these settings
- **Settings -> Actions -> General -> Workflow permissions:** choose **Read and write permissions**, click **Save**. (The workflow also asks for this itself; this setting is the safety net.)

### 5. Do a test build (optional but recommended)
1. **Actions** tab -> **Build installers** (left list) -> **Run workflow** -> **Run workflow**.
2. Wait for the green check marks. Click the finished run; the installers are under **Artifacts** at the bottom. Download and test them.
   (A test build doesn't create a release.)

---

## Every time you release a new version

1. **Choose the number.** Middle number up for new features (2.1.0 -> 2.2.0), last number for small fixes (2.1.0 -> 2.1.1).
2. **Edit three things** (on github.com you can click a file, then the pencil icon, or edit in your clone):
   - `scorebug_server.py`: change the line `VERSION = "2.1.0"` to the new number.
   - `CHANGELOG.md`: add a new section at the top, for example `## 2.2.0 - 2026-12-01` with Added / Changed / Fixed bullets.
   - If the Stream Deck plugin changed: `streamdeck-plugin/com.scorebugstudio.controller.sdPlugin/manifest.json` (`"Version": "1.3.0.0"`) and `CHANGELOG-streamdeck.md`.
3. **Commit and push** your changes (GitHub Desktop: write a summary, **Commit to main**, **Push origin**; on the website: **Commit changes**).
4. **Publish the release:** repo page -> **Releases** -> **Draft a new release**.
   - **Choose a tag** -> type `v2.2.0` (the same number as `VERSION`, with a `v` in front) -> **Create new tag: v2.2.0 on publish**.
   - **Release title:** `Scorebug Studio 2.2.0`.
   - **Description:** paste the new section from `CHANGELOG.md`.
   - Click **Publish release**.
5. **Wait.** Publishing starts the build automatically (Actions tab, "Build installers"). In 10-15 minutes the four files appear on the release page under **Assets**. If the number in the tag doesn't match `VERSION`, the build stops with a message telling you what to change - fix it, delete the release and its tag, and publish again.
6. **Test** the downloads on a Windows PC and a Mac before announcing it. Then tell your testers to download from the Releases page.

---

## If a build fails
1. **Actions** tab -> click the run with the red X -> click the red job (Windows, mac or streamdeck) -> click the red step to expand it.
2. Copy the last 40-50 lines of the log and paste them to Claude with "the GitHub build failed". The first run on a new setup often needs a small fix.
3. After fixing, delete the failed release and its tag (**Releases** -> the release -> trash icon; then **Tags** -> delete) and publish again, or use **Actions -> Run workflow** to retry a test build.

## Test checklist (each new version)
- Install on Windows: Start Menu entry works, tray icon appears, control panel opens, OBS shows the overlay.
- Install on a Mac: drag to Applications, **Open Anyway** step works, menu-bar icon appears, control panel opens.
- Install over the previous version: your teams, logos and saved games are still there.
- iPad: Style -> **Allow other devices**, scan the QR code, Stat Keeper opens.
- Stream Deck: install the plugin file, keys light up when the app is running.
- Quit from the tray / menu bar really stops it (OBS overlay goes blank).

## Later: removing the "unsigned" warnings
Installers work without signing but show warnings (Windows SmartScreen; macOS Gatekeeper). To remove them you need:
- **Mac:** an Apple Developer Program membership (about $99/year) to sign and notarize.
- **Windows:** a code-signing certificate, or Microsoft's Trusted Signing service.
Both can be added to this workflow later using GitHub **Secrets**. Ask Claude to add it when you're ready.

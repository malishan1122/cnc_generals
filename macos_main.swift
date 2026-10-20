import Cocoa
import WebKit

// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition v2.0)
// macos_main.swift — Phase 4 (SYS-28) Native macOS App Shell & Menu Bar Bridge
// ============================================================================

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupNativeMenuBar()

        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        window = NSWindow(
            contentRect: screenRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Command & Conquer: Generals – Zero Hour (v2.0 macOS Edition)"
        window.backgroundColor = NSColor(calibratedRed: 0.03, green: 0.04, blue: 0.08, alpha: 1.0)
        window.collectionBehavior = [.fullScreenPrimary]
        window.delegate = self

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        window.contentView?.addSubview(webView)

        // Resolve index.html either inside .app/Contents/Resources/ or alongside the .app bundle
        let bundleURL = Bundle.main.bundleURL
        let resourceDir = Bundle.main.resourceURL
        let resourceIndex = resourceDir?.appendingPathComponent("index.html")
        let projectDir = bundleURL.deletingLastPathComponent()
        let siblingIndex = projectDir.appendingPathComponent("index.html")

        if let resIdx = resourceIndex, FileManager.default.fileExists(atPath: resIdx.path), let resDir = resourceDir {
            webView.loadFileURL(resIdx, allowingReadAccessTo: resDir)
        } else if FileManager.default.fileExists(atPath: siblingIndex.path) {
            webView.loadFileURL(siblingIndex, allowingReadAccessTo: projectDir)
        }

        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func setupNativeMenuBar() {
        let mainMenu = NSMenu()
        NSApp.mainMenu = mainMenu

        // 1. Application Menu
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "About C&C: Generals – Zero Hour v2.0", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide C&C: Generals", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit C&C: Generals – Zero Hour", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        // 2. Game Menu (Phase 4 SYS-25 / SYS-28)
        let gameMenuItem = NSMenuItem()
        mainMenu.addItem(gameMenuItem)
        let gameMenu = NSMenu(title: "Game")
        gameMenuItem.submenu = gameMenu
        gameMenu.addItem(withTitle: "Main Menu / New Operation", action: #selector(openMainMenu), keyEquivalent: "n")
        gameMenu.addItem(withTitle: "Pause / Resume Tactical Clock", action: #selector(togglePause), keyEquivalent: "p")
        gameMenu.addItem(NSMenuItem.separator())
        gameMenu.addItem(withTitle: "Quick Save Skirmish (Slot 1)", action: #selector(quickSaveGame), keyEquivalent: "s")
        gameMenu.addItem(withTitle: "Quick Load Skirmish (Slot 1)", action: #selector(quickLoadGame), keyEquivalent: "l")
        let exportItem = NSMenuItem(title: "Export .zhsave Snapshot...", action: #selector(exportSaveSnapshot), keyEquivalent: "S")
        exportItem.keyEquivalentModifierMask = [.command, .shift]
        gameMenu.addItem(exportItem)
        gameMenu.addItem(NSMenuItem.separator())
        gameMenu.addItem(withTitle: "Toggle AI Auto-Play Simulator", action: #selector(toggleAutoSimulator), keyEquivalent: "t")

        // 3. Audio Menu
        let audioMenuItem = NSMenuItem()
        mainMenu.addItem(audioMenuItem)
        let audioMenu = NSMenu(title: "Audio")
        audioMenuItem.submenu = audioMenu
        audioMenu.addItem(withTitle: "Toggle Faction Music", action: #selector(toggleMusic), keyEquivalent: "m")
        audioMenu.addItem(withTitle: "Toggle Combat SFX", action: #selector(toggleSFX), keyEquivalent: "")
        audioMenu.addItem(withTitle: "Toggle EVA & Unit Voices", action: #selector(toggleEVA), keyEquivalent: "")

        // 4. View Menu
        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenuItem.submenu = viewMenu
        let fsItem = NSMenuItem(title: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fsItem.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(fsItem)
    }

    @objc func openMainMenu() {
        webView?.evaluateJavaScript("document.getElementById('btn-main-menu')?.click();", completionHandler: nil)
    }

    @objc func togglePause() {
        webView?.evaluateJavaScript("document.getElementById('btn-pause-game')?.click();", completionHandler: nil)
    }

    @objc func quickSaveGame() {
        webView?.evaluateJavaScript("window.ZH_UI && window.ZH_UI.quickSave();", completionHandler: nil)
    }

    @objc func quickLoadGame() {
        webView?.evaluateJavaScript("window.ZH_UI && window.ZH_UI.quickLoad();", completionHandler: nil)
    }

    @objc func exportSaveSnapshot() {
        webView?.evaluateJavaScript("window.ZH_UI && window.ZH_UI.exportSaveFile();", completionHandler: nil)
    }

    @objc func toggleAutoSimulator() {
        webView?.evaluateJavaScript("document.getElementById('btn-auto-sim')?.click();", completionHandler: nil)
    }

    @objc func toggleMusic() {
        webView?.evaluateJavaScript("document.getElementById('btn-toggle-music')?.click();", completionHandler: nil)
    }

    @objc func toggleSFX() {
        webView?.evaluateJavaScript("document.getElementById('btn-toggle-sfx')?.click();", completionHandler: nil)
    }

    @objc func toggleEVA() {
        webView?.evaluateJavaScript("document.getElementById('btn-toggle-voice')?.click();", completionHandler: nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

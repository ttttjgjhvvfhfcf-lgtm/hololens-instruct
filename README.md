# hololens-instruct

Unity/MRTK-Projektgerüst für die Microsoft HoloLens (1st Gen).

## Stack

- **Unity 2019.4 LTS** – letzte Unity-Version mit Legacy-Built-in-XR-Support für HoloLens 1. Ab Unity 2020 wurde das Legacy-XR-System durch XR Plugin Management ersetzt, das HoloLens 1 nicht mehr unterstützt (HoloLens 1 kann kein OpenXR).
- **MRTK v2.8.3** (Mixed Reality Toolkit) – letztes MRTK2-Release mit HoloLens-1-Unterstützung. MRTK3 ist HoloLens-2/OpenXR-only.
- Zielplattform: UWP, Architektur **x86**, Zielgerät HoloLens.

## Voraussetzungen (Windows-Rechner nötig)

Dieses Gerüst wurde in einer Linux-Umgebung ohne Unity-Editor/Visual Studio angelegt – es enthält daher nur Text-/Code-Dateien (Ordnerstruktur, Paket-Manifest, Beispielskript). Zum Öffnen, Bauen und Deployen brauchst du:

- Windows 10/11
- Unity Hub + **Unity 2019.4.x LTS** (bei der Installation das Modul „Universal Windows Platform Build Support" mit auswählen)
- Visual Studio 2019 oder 2022 mit Workload „Universelle Windows-Plattform-Entwicklung" (optional zusätzlich „Desktopentwicklung mit C++")
- Windows 10 SDK ≥ 10.0.17763.0
- HoloLens (1st Gen) mit aktiviertem Entwicklermodus, oder der HoloLens-Emulator (benötigt Hyper-V)

## Setup

1. Projekt-Ordner in Unity Hub öffnen. Falls die exakte Patch-Version aus `ProjectSettings/ProjectVersion.txt` (2019.4.40f1) nicht installiert ist, eine beliebige aktuelle 2019.4-LTS-Version installieren/verwenden.
2. Unity löst beim ersten Öffnen die Pakete aus `Packages/manifest.json` auf, inkl. MRTK 2.8.3 über die von Microsoft gehostete Scoped Registry. Das erfordert Internetzugang auf dem Windows-Rechner.
   - Falls die Paketauflösung fehlschlägt: alternativ das [Mixed Reality Feature Tool](https://learn.microsoft.com/en-us/windows/mixed-reality/develop/unity/welcome-to-mr-feature-tool) verwenden – das ist der offiziell robustere Weg, MRTK-Pakete inkl. Abhängigkeiten einzurichten.
3. Menü `Mixed Reality Toolkit > Utilities > Configure Unity Project` ausführen – setzt automatisch Force-Text-Serialisierung, sichtbare Meta-Dateien, Player-Settings-Grundlagen usw.
4. Neue Szene anlegen, als `Assets/Scenes/MainScene.unity` speichern und in den Build Settings hinzufügen (bewusst nicht in diesem Gerüst enthalten, da eine Szenendatei ohne Editor nicht verlässlich von Hand erzeugbar ist).
5. Menü `Mixed Reality Toolkit > Add to Scene and Configure` ausführen und im Profil-Dropdown **DefaultHoloLens1ConfigurationProfile** auswählen (nicht das HoloLens-2-Profil).
6. **File > Build Settings**, Plattform auf *Universal Windows Platform* wechseln, dann:
   - Target Device: **HoloLens**
   - Architecture: **x86** – nicht ARM/ARM64/x64, das ist der häufigste HoloLens-1-Stolperstein (HoloLens 1 hat einen Intel-Atom-x86-Prozessor)
   - Target SDK Version / Minimum Platform Version: **10.0.17763.0**
   - Build Type: D3D
7. **Player Settings > Publishing Settings > Capabilities** aktivieren: `InternetClient`, `Microphone`, `WebCam`, `PicturesLibrary`, `VideosLibrary`, `SpatialPerception` (Spatial Perception nur, falls Spatial Mapping/Surface Observer genutzt wird).
8. Build ausführen, die generierte `.sln` in Visual Studio öffnen, Konfiguration **Release / x86** wählen, auf Gerät oder Emulator deployen.

## Struktur

```
Assets/
  Scenes/                    # MainScene.unity hier anlegen (Editor-Schritt, siehe Setup 4.)
  Scripts/
    Interactions/
      TapToCycleColor.cs     # Beispiel: Air-Tap-Interaktion über IMixedRealityPointerHandler
  Prefabs/
  Materials/
Packages/
  manifest.json               # Unity-Kernpakete + MRTK 2.8.3 (Scoped Registry)
ProjectSettings/
  ProjectVersion.txt          # pinnt Unity 2019.4 LTS
```

`TapToCycleColor.cs` ist ein minimales Beispiel, das zeigt, wie ein MRTK-Pointer-Event (Air-Tap, Controller-Klick, …) verarbeitet wird. Für die meisten MRTK-Bausteine (Interactable, ObjectManipulator, SpeechInputHandler, …) braucht es kein eigenes Skript – die werden nach Paketinstallation direkt als Komponenten im Inspector hinzugefügt.

## SimpleBrowser (Edge-Ersatz)

Eigenständige, schlanke 2D-UWP-App als Ersatz für die auf HoloLens 1 nicht mehr funktionierende Edge-App: Adressleiste + Zurück/Vor/Neu laden/Startseite, läuft wie jede 2D-UWP-App als schwebende Kachel im Holographic Shell (kein Unity/MRTK nötig).

**Wichtiger Hinweis:** Die App nutzt intern denselben `WebView`-Steuerelement-Typ (EdgeHTML-Engine), den auch die Edge-App verwendet. Falls Edge wegen veralteter Root-Zertifikate oder abgeschalteter TLS-Versionen bricht – HoloLens 1 ist seit Dezember 2024 „end of support" und bekommt keine Updates mehr –, kann dasselbe Problem hier bei HTTPS-Seiten auftreten. Einen Versuch ist es trotzdem wert, da Edge auf HoloLens oft aus anderen Gründen ausfällt (z. B. abgeschaltete Cloud-Dienste für Startseite/Sync). Falls auch diese App bei allen Seiten fehlschlägt, ist das ein Zertifikats-/OS-Problem, das sich nicht pauschal per App umgehen lässt.

Das komplette Visual-Studio-Projekt liegt in `SimpleBrowser/` (`SimpleBrowser.csproj`, `App.xaml(.cs)`, `MainPage.xaml(.cs)`, `Package.appxmanifest`, `Assets/` mit Platzhalter-Icons, Ziel-SDK 10.0.17763.0):

1. `SimpleBrowser/SimpleBrowser.csproj` in Visual Studio öffnen (VS bietet beim ersten Öffnen an, eine `.sln` dazu anzulegen).
2. Build-Konfiguration **Debug oder Release / x86** wählen (HoloLens 1 = x86, siehe oben) und auf Gerät oder Emulator deployen. Die `internetClient`-Capability ist im Manifest bereits gesetzt.
3. Die Tile-/Splash-Bilder in `Assets/` sind einfarbige Platzhalter (per Skript erzeugt, da hier kein Bildeditor zur Verfügung stand) – rein kosmetisch, für einen funktionierenden Build nicht relevant, aber bei Gelegenheit durch echte Icons ersetzbar.

**CI:** `.github/workflows/simplebrowser-build.yml` baut das Projekt bei jedem Push/PR, der `SimpleBrowser/**` berührt, automatisch auf einem `windows-2022`-Runner (Debug/x86, Signierung deaktiviert). Das validiert nur, dass der Code kompiliert – kein Deploy, kein Emulator-Lauf, kein Laufzeitverhalten. Ein grüner Check heißt also „baut fehlerfrei", nicht „funktioniert auf echter Hardware".

## Quellen

- [Choosing a Unity version and XR plugin](https://learn.microsoft.com/en-us/windows/mixed-reality/develop/unity/choosing-unity-version)
- [Using the Unity Package Manager – MRTK 2](https://learn.microsoft.com/en-us/windows/mixed-reality/mrtk-unity/mrtk2/configuration/usingupm)
- [HoloLens (1st gen) Basics 101E](https://learn.microsoft.com/en-us/windows/mixed-reality/develop/unity/tutorials/holograms-101e)
- [Mixed Reality Feature Tool](https://learn.microsoft.com/en-us/windows/mixed-reality/develop/unity/welcome-to-mr-feature-tool)

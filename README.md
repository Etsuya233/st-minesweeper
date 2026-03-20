# 💣 Mini Minesweeper - SillyTavern Extension

A classic Minesweeper game embedded as a SillyTavern extension. Kill time while waiting for AI responses!

## Features

- 🎮 **Three Difficulty Levels** — Easy (9×9, 10 mines), Medium (16×16, 40 mines), Hard (16×30, 99 mines)
- 📱 **Mobile Friendly** — Full touch support with long-press to flag, responsive layout for smaller screens
- 🪟 **Draggable Window** — Glassmorphism-inspired dark UI, drag the titlebar to reposition
- 💣 **Floating Action Button (FAB)** — Draggable bomb button to open/close the game, customizable size & opacity
- ⏱ **Timer & Best Times** — Tracks elapsed time and saves your best record per difficulty
- 🔢 **Chord Reveal** — Click on a numbered cell with correct flags to auto-reveal neighbors
- ⚙️ **Settings Panel** — Toggle FAB visibility, adjust size/opacity, reset positions
- 📳 **Haptic Feedback** — Vibration on Android, native haptic on iOS 18+ Safari
- 💾 **Persistent Settings** — Difficulty, best times, and FAB position are saved across sessions

## Installation

### Via SillyTavern Extension Installer

1. Open SillyTavern and navigate to **Extensions** → **Install Extension**
2. Paste the following URL:
   ```
   https://github.com/Etsuya233/st-minesweeper
   ```
3. Click **Install** and reload SillyTavern

### Manual Installation

1. Clone or download this repository into your SillyTavern `data/default-user/extensions/third-party/` directory:
   ```bash
   cd /path/to/SillyTavern/data/default-user/extensions/third-party/
   git clone https://github.com/Etsuya233/st-minesweeper.git
   ```
2. Restart SillyTavern

## How to Play

| Action | Desktop | Mobile |
|---|---|---|
| Reveal a cell | Left click | Tap |
| Place/remove flag | Right click | Long press |
| Chord reveal | Click a numbered cell (when flags match) | Tap a numbered cell |
| Restart game | Click 😊 button | Tap 😊 button |

## Settings

Access the settings panel in **Extensions** → **💣 Mini Minesweeper**:

- **Enable FAB** — Show/hide the floating bomb button
- **Button Size** — Adjust FAB diameter (32–80px)
- **Button Opacity** — Adjust FAB transparency (20–100%)
- **Reset Position** — Reset FAB and game window to default positions

## License

MIT

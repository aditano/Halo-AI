# Rainfall

A Halo Infinite–inspired first-person shooter in **Three.js**.

## Naming

| Layer | Name | Meaning |
|--------|------|---------|
| **Game / product** | **Rainfall** | The title of this project |
| **Mission** | **Ringfall** | Opening campaign mission (shown on the menu) |
| **GitHub repo** | `Halo-AI` (current) | Rename in GitHub → Settings → General if you want the remote to match |

Halo games work the same way: franchise/product title vs individual mission names (e.g. *Halo Infinite* → “Warship Gbraakon”).

## Run

```bash
npm install
npm run dev
```

## Controls

| Input | Action |
|--------|--------|
| WASD | Move |
| Mouse | Look (pointer lock) |
| LMB | Fire |
| RMB | Aim down sights |
| R | Reload |
| 1 / 2 / 3 | BR / AR / Plasma |
| Scroll / Q | Cycle weapons |
| Shift | Sprint |
| Space | Jump |
| C / Ctrl | Crouch |

## Stack

- Vite + TypeScript + Three.js
- PBR + environment reflections, bloom / SMAA, ACES tonemapping
- Positional HRTF audio + dynamic combat music
- Halo CE–style title ring + procedural choir bed

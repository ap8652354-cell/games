# Bugatti Drive 3D

A WebGL/HTML5 driving game with a Bugatti Chiron-inspired car, realistic
physics, and PBR-style graphics. Runs in any modern browser on PC and Android.

## How to play

Just open `index.html` in a browser (or host the folder on any static server,
e.g. `python -m http.server`). No build step needed — everything is loaded as
ES modules from a CDN via an import map.

### Controls

| Key | Action |
|-----|--------|
| **W** | Accelerate |
| **S** | Brake / reverse |
| **A** / **D** | Steer left / right |
| **Space** | Handbrake (drift) |
| **C** | Cycle camera (chase, low, cinematic, cockpit) |
| **R** | Reset car to start |
| **H** | Toggle HUD |

On touch devices, on-screen buttons appear automatically.

## Stack

- **[three.js](https://threejs.org/) r160** — rendering (PBR materials,
  PCF soft shadows, ACES tone mapping, custom sky shader).
- **[cannon-es](https://github.com/pmndrs/cannon-es) 0.20.0** — physics
  (`RaycastVehicle` with per-wheel suspension, friction slip, and engine
  forces).

## Features

- Procedural Chiron silhouette: two-tone French-blue / black body, signature
  C-line, horseshoe grille, quad LED headlights, full-width tail strip,
  quad exhaust, and active rear wing.
- 1900 kg chassis with low-slung CG, RWD with engine braking, speed-sensitive
  steering, and a handbrake that reduces rear grip for drifting.
- Procedural oval track with dashed center line, three ramps for jumps,
  knock-down cones, stackable crates, decorative trees, distant mountains,
  and a start banner with a checkered line.
- Tire-smoke and dust particle pools, four camera modes, animated speedometer
  with RPM bar and 7-speed gear indicator.

All assets are generated at runtime — there are no external image, model, or
audio files.

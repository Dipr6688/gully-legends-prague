# Gully Legends Prague — Exact Original Style Instructions for Codex

## Critical discovery about the old prototype

The old `index.html` did **not** use a separate Prague background image plus separate UI components.
It used one flattened `1448 × 1086` image named `dashboard.png` as the entire dashboard surface:

```css
.dashboard {
  position: relative;
  width: 100%;
  aspect-ratio: 1448 / 1086;
  background-image: url("dashboard.png");
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
```

Transparent hotspot elements were then positioned over the screenshot. That is why the old version looked pixel-perfect but had alignment and responsiveness problems.

The four files in `public/player-cards/` are also **flattened full player cards**, not transparent character-only avatars.

## Files supplied in this asset pack

```text
design-reference/gully-legends-dashboard.png
public/player-cards/aninda.png
public/player-cards/arunabha.png
public/player-cards/atripan.png
public/player-cards/biplab.png
reference-code/original-index.html
```

Use all supplied PNG files exactly as provided. Do not regenerate, redraw, recolour, crop, or replace them.

## Goal

Build a maintainable, responsive Next.js website that visually matches `design-reference/gully-legends-dashboard.png` as closely as practical, but uses real React components and genuine buttons, links, panels, forms, and navigation.

Do **not** use the full dashboard screenshot as the production page background. It is a design reference only.

Do **not** use invisible click hotspots.

## Exact visual direction

- Canvas reference: `1448 × 1086`.
- Overall background: near-black blue, approximately `#05080d`.
- Panels: dark blue-black, approximately `#0d141d`.
- Borders: subtle white at about 10–12% opacity.
- Primary yellow: approximately `#f7c734`.
- Lime accent: approximately `#b7ff39`.
- Cyan accent: approximately `#46dfff`.
- Purple accent: approximately `#ca4bff`.
- Use strong comic/gaming typography, uppercase labels, dark glass panels, neon outlines, and rounded corners.
- Preserve the Prague-European gully-cricket atmosphere from the reference.
- Fixed venue text: `ČZU Gully Arena` and `Open Field, Prague`.

## Player card rule

For Phase 1, use the supplied full player-card images directly inside real clickable card buttons:

```tsx
<Image
  src="/player-cards/aninda.png"
  alt="Aninda — Rulebook Rambo"
  width={212}
  height={385}
  priority
/>
```

Repeat with the correct native dimensions:

- Aninda: `212 × 385`
- Arunabha: `222 × 385`
- Atripan: `212 × 385`
- Biplab: `215 × 385`

Do not recreate the avatars with emoji, initials, SVG faces, generic stock portraits, or AI-generated replacements.

## Layout requirements at desktop reference size

At approximately `1448px` viewport width:

1. Top navigation spans the full width and is about `70px` high.
2. Prague hero area runs from approximately `y=70` to `y=390`.
3. Monthly Beasts panel occupies the left column below the hero.
4. Four player cards appear in one row in the centre.
5. Gully Rules occupies the right column.
6. Recent Matches and Top Performers sit underneath the player cards.
7. All players start at Level `0` and ratings `0/100`.
8. Monthly awards show no winner until finalised matches exist.

On smaller screens, convert the layout to real responsive rows/columns. Do not shrink the entire desktop dashboard into an unreadable image.

## Prague background issue

There is no clean background-only image in the old prototype. The supplied dashboard reference is flattened and already contains navigation, panels, player cards, text, and effects.

Therefore:

- Do not claim that `gully-legends-dashboard.png` is a background-only asset.
- Do not set it as the production page background.
- Rebuild the Prague hero scene using the current project background asset only if it genuinely matches the reference.
- If the current `public/backgrounds/prague-gully-arena.png` looks different, keep it temporarily but match the overlay, crop, darkness, panel positioning, and visual treatment to the reference.
- Do not generate another new Prague image unless the user explicitly approves it.

## Exact Codex task

Read this file and inspect all supplied assets before editing.

1. Audit the current Next.js implementation.
2. Remove any generated or generic player avatars.
3. Use the exact supplied player-card PNG files.
4. Keep the current application as real responsive components.
5. Match the reference dashboard's spacing, panel sizes, typography, colours, border glow, and hierarchy.
6. Make every visible navigation item and button a real accessible control.
7. Preserve Level 0, XP 0, and all ratings/statistics at zero.
8. Do not modify the supplied PNG files.
9. Do not update this instruction file unless the user explicitly requests it.
10. Do not overwrite README requirements silently; report proposed README edits first.

## Verification

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Also verify at:

- `1448 × 1086`
- `1280 × 800`
- `1024 × 768`
- `390 × 844`

At `1448 × 1086`, compare the result side by side with:

```text
design-reference/gully-legends-dashboard.png
```

Report the remaining visual differences honestly. Pixel-identical reproduction is not expected when rebuilding the flattened screenshot as responsive components, but the overall visual identity should be very close.

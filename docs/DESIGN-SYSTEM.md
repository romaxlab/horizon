# Design System & Styling Rules

## 1. Visual direction

The interface should feel:

- professional;
- minimal;
- premium;
- calm;
- precise;
- highly legible;
- operational rather than decorative.

Direction:

> **Apple-like product polish applied to a modern UAV operations interface.**

Avoid sci-fi cosplay, excessive neon, dense HUD decoration and decorative information that does not help the operator.

Reference image:

`docs/media/control-center-concept.png`

The reference defines direction, not pixel-perfect implementation.

## 2. Styling stack

Use only:

```text
TailwindCSS
+
CSS-variable design tokens
+
first-party UI primitives
```

Do not add a general-purpose UI component library.

Do not add:

- MUI;
- Vuetify;
- PrimeVue;
- Bootstrap;
- SCSS as a parallel design system;
- component-local CSS systems that bypass tokens.

## 3. The one rule

> **Raw design values exist only in the token source. Application code consumes variables, semantic utilities and primitives.**

In application and UI component code, do not hardcode:

- `#hex`;
- `rgb()/rgba()`;
- spacing values;
- radii;
- font sizes;
- font weights;
- line heights;
- shadows;
- blur values;
- fixed design widths/heights when they belong to the design scale.

The exception is a genuinely dynamic runtime value such as a computed Cesium position, transform or measured element size.

## 4. Token architecture

```text
raw values
  ↓
primitive CSS vars
  ↓
semantic CSS vars
  ↓
Tailwind semantic utilities
  ↓
UI primitive variants
  ↓
application modules
```

### primitives.css

This is the only place allowed to contain the actual raw design values.

Examples:

```text
--color-neutral-0
--color-neutral-50
--color-neutral-100
...
--space-2
--space-4
--space-8
...
--radius-sm
--radius-md
--radius-lg
--font-size-body-sm
--font-weight-medium
--shadow-surface
--size-panel
```

Feature/application code must not use primitive color ramps directly unless there is no semantic role and the design-system documentation explicitly allows it.

### semantic.css

Semantic roles reference primitives.

Examples:

```text
--bg-canvas
--bg-surface
--bg-surface-raised
--bg-overlay

--text-primary
--text-secondary
--text-tertiary
--text-inverse

--border-default
--border-subtle
--border-strong
--border-focus

--fill-primary
--fill-primary-hover
--fill-neutral
--fill-neutral-hover
--fill-danger
--fill-warning

--status-success
--status-warning
--status-danger
--status-info
```

Application code should think in semantic meaning, not palette values.

## 5. Light and dark themes

Both themes are implemented from the first design-system task.

```css
:root {
  /* light semantic aliases */
}

:root[data-theme='dark'] {
  /* dark semantic aliases */
}
```

Theme switching changes semantic token values.

Components must not branch on the theme to choose design values.

Bad:

```ts
const color = isDark ? '#fff' : '#111'
```

Good:

```text
text-primary
bg-surface
border-default
```

## 6. Tailwind is a semantic API

Tailwind must expose our CSS variables rather than encourage arbitrary values.

Application-facing utilities should look like:

```text
bg-canvas
bg-surface
bg-surface-raised
text-primary
text-secondary
border-default
border-subtle

p-space-md
gap-space-sm
gap-space-md
rounded-control
rounded-surface
shadow-surface
w-panel
```

Avoid default/arbitrary visual values in feature code when a token should exist.

Bad:

```html
<div class="bg-[#121212] rounded-[14px] p-[18px] shadow-[...]">
```

Bad for design spacing:

```html
<div class="p-4 gap-3 rounded-xl">
```

Preferred:

```html
<div class="p-space-md gap-space-sm">
```

or, for a visual surface:

```vue
<BasePanel>
```

Structural classes remain fine:

```text
flex
grid
grid-cols-2
items-center
justify-between
absolute
inset-0
w-full
h-full
overflow-hidden
```

## 7. First-party primitives

Visual chrome is implemented once in `@swarm/ui`.

Expected primitives may include:

```text
BaseText
BaseButton
BaseIconButton
BaseInput
BaseSelect
BaseMenu
BaseTooltip

BaseSurface
BasePanel
BaseCard
BaseSection
BaseDivider

BaseBadge
BaseMetric
BaseProgress
BaseAlert
```

Do not prebuild every possible component. Add a primitive when it has a clear reusable purpose.

## 8. Wrappers/cards/surfaces are primitives too

Do not repeatedly hand-build card/panel wrappers in feature modules.

Bad:

```html
<div class="bg-surface border-border-default rounded-surface shadow-surface ...">
```

when the element is clearly a reusable panel/card.

Preferred:

```vue
<BasePanel>
  ...
</BasePanel>
```

or:

```vue
<BaseCard>
  ...
</BaseCard>
```

The design system decides the visual treatment in one place.

## 9. Variants express intent

Call sites select meaning/behavior, not raw appearance.

```vue
<BaseButton variant="primary" size="md">
  Launch Mission
</BaseButton>
```

```vue
<BaseButton variant="danger" size="md">
  Abort Mission
</BaseButton>
```

```vue
<BaseBadge variant="warning">
  Warning
</BaseBadge>
```

Do not copy variant names from unrelated legacy projects.

A variant such as `glass` should exist only if this project's design system explicitly defines and needs it.

## 10. Variant implementation

Use `class-variance-authority` (CVA) or an equivalent lightweight typed pattern.

A primitive owns:

- base classes;
- variants;
- sizes;
- states;
- focus behavior;
- disabled behavior.

Feature modules should not restyle a primitive with long class strings.

## 11. Feature/module styling rules

Feature modules may use Tailwind directly for layout/composition:

- flex/grid;
- positioning;
- alignment;
- responsive rules;
- overflow;
- semantic spacing utilities;
- structural sizing.

Feature modules should use primitives for:

- cards/panels/surfaces;
- controls;
- buttons;
- typography;
- status badges;
- alerts;
- progress;
- menus/popovers;
- inputs.

## 12. Typography

Typography is variant-based.

Example scale:

```text
display
heading-lg
heading-md
heading-sm

body-lg
body-md
body-sm

label-lg
label-md
label-sm

caption
```

Each variant owns:

- font family;
- size;
- weight;
- line height;
- letter spacing where needed.

Usage:

```vue
<BaseText variant="heading-md">
  UAV-04
</BaseText>
```

Do not override size/weight manually at call sites.

## 13. Status semantics

Brand/accent colors and operational status colors are separate concerns.

Use semantic status roles:

```text
success
warning
danger
info
```

A status must look consistent in Fleet, Map labels, Inspector and Alerts.

## 14. Theme toggle

The app supports explicit light/dark selection.

The selection should set `data-theme` on the root document element and may persist in local storage.

The theme mechanism must not leak into every component.

## 15. Accessibility

Required:

- native interactive elements;
- visible `:focus-visible` state;
- sufficient contrast in both themes;
- keyboard-accessible controls;
- labels/aria-labels for icon-only controls;
- `prefers-reduced-motion` support;
- no critical status communicated by color alone.

## 16. Motion

Application UI motion should be subtle and fast.

Cesium camera motion may be longer and cinematic.

Reduced-motion mode must disable or simplify non-essential animation.

## 17. Package boundary

`@swarm/ui` is domain-agnostic.

It must not import or know about:

- UAV;
- Mission;
- Telemetry;
- Cesium;
- Incident.

Domain-composed components such as `FleetPanel`, `MissionStatusBar` or `UavInspector` live in application modules.

## 18. New visual pattern rule

When a feature needs a new visual pattern:

1. check existing primitives and variants;
2. extend an existing primitive if semantics match;
3. add a new primitive only if the concept is reusable;
4. do not solve it with one-off raw values in the feature.

## 19. Dynamic inline styles

Inline styles are allowed only for runtime-computed values.

Examples:

```text
transform based on runtime coordinates
measured width
Cesium-derived position
progress width when not expressible otherwise
```

They are not allowed for static design values.

## 20. Style guard

The repo should include a simple automated check that rejects common violations outside token source files, such as:

- raw hex colors;
- `rgb()`/`rgba()`;
- arbitrary Tailwind color classes;
- obvious arbitrary spacing/radius/shadow values.

The guard should be practical and avoid blocking legitimate runtime calculations.

## 21. Review checklist

Before a UI task is complete:

- both themes work;
- no raw design values in feature code;
- text uses typography primitives/variants;
- cards/panels/wrappers use primitives;
- controls use primitive variants;
- semantic Tailwind utilities use CSS vars;
- focus-visible works;
- reduced motion is respected;
- no duplicate visual pattern was created ad hoc.

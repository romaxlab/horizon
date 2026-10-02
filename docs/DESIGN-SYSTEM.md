# Design System

## 1. Direction

Horizon should feel:

- professional;
- calm;
- precise;
- modern;
- minimal;
- operational rather than decorative.

The interface is map-first. UI panels should support situational awareness without competing with the map.

Avoid:

- excessive neon;
- sci-fi HUD decoration;
- dense admin-dashboard chrome;
- unnecessary borders and cards;
- status colors used decoratively;
- visual noise.

The visual target is a polished professional control application with restrained motion and strong information hierarchy.

---

## 2. Styling stack

Use:

```text
TailwindCSS
+
CSS-variable design tokens
+
first-party UI primitives
```

Do not introduce a full component library.

The application owns its visual language.

---

## 3. Token architecture

```text
primitive tokens
      ↓
semantic tokens
      ↓
Tailwind semantic utilities
      ↓
UI primitives
      ↓
feature/application UI
```

### Primitive tokens

Raw design scales such as:

- color ramps;
- spacing;
- radii;
- shadows;
- type sizes;
- type weights;
- control sizes.

Feature code should not normally consume primitive values directly.

### Semantic tokens

Meaning-based roles.

Examples:

```text
--bg-canvas
--bg-surface
--bg-surface-raised
--bg-surface-hover

--text-primary
--text-secondary
--text-muted

--border-default
--border-subtle
--border-focus

--action-primary
--action-primary-hover

--status-success
--status-warning
--status-danger
--status-info
```

Application code should express semantic intent rather than raw visual values.

---

## 4. Light and dark themes

Both themes are first-class from the start.

Theme switching happens at the semantic-token layer:

```css
:root {
  /* light semantic values */
}

:root[data-theme='dark'] {
  /* dark semantic overrides */
}
```

Components do not branch on theme to choose colors.

Bad:

```ts
isDark ? '#ffffff' : '#111111'
```

Preferred:

```text
text-primary
bg-surface
border-default
```

---

## 5. Tailwind usage

Tailwind exposes semantic tokens through named utilities.

Preferred:

```html
<div class="bg-surface text-text-primary border-border-default">
```

Avoid:

```html
<div class="bg-[#121212] text-[#f4f4f4] border-[#333333]">
```

Feature components may use Tailwind directly for layout/composition:

- flex/grid;
- gap;
- position;
- alignment;
- overflow;
- responsive layout;
- sizing tied to approved scales.

Reusable visual chrome should come from UI primitives.

---

## 6. First-party primitives

Initial primitives should be added only when required by real product UI.

Expected core set:

```text
BaseText
BaseButton
BaseIconButton
BaseInput
BaseSelect

BaseSurface
BasePanel
BaseDivider

BaseBadge
BaseMetric
BaseProgress
BaseAlert
BaseMenu
BaseTooltip
```

Avoid creating several primitives with the same responsibility.

For example, prefer a flexible surface primitive with meaningful variants rather than separate nearly-identical container components.

---

## 7. Variants

Primitive appearance is controlled through typed semantic variants.

Example:

```vue
<BaseButton variant="primary" size="md">
  Launch Mission
</BaseButton>
```

```vue
<BaseBadge variant="warning">
  Warning
</BaseBadge>
```

```vue
<BaseSurface variant="panel">
  ...
</BaseSurface>
```

Variant names describe intent, not implementation detail.

Use a lightweight variant composition utility such as `class-variance-authority`.

Do not copy variant names from unrelated projects.

---

## 8. Typography

Typography uses named variants rather than ad-hoc font classes in feature code.

Suggested hierarchy:

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

Example:

```vue
<BaseText variant="heading-md">
  UAV-04
</BaseText>
```

Typography variants own:

- font size;
- line height;
- weight;
- optional letter spacing.

---

## 9. Surfaces and panels

The map is the dominant surface.

Panels should feel lightweight and integrated rather than like a grid of independent SaaS cards.

Common surface intents may include:

```text
panel
floating
subtle
raised
```

Exact variants should follow actual product needs.

Feature modules should not hand-build repeated panel chrome using long Tailwind class strings.

If the same visual pattern repeats, it belongs in the design system.

---

## 10. Status semantics

Operational colors are reserved for meaning.

Use consistent semantics:

```text
success
warning
danger
info
neutral
```

Examples:

- healthy/live → success;
- degraded/low battery → warning;
- lost/critical → danger;
- informational event → info.

Do not use warning/danger colors as decorative accents.

---

## 11. Control Center UI hierarchy

### Header

Keep minimal:

- Horizon identity;
- current mission;
- connection state;
- time;
- New Mission;
- theme control if exposed.

Avoid generic top-level navigation that has no real feature behind it.

### Fleet Panel

Compact and scan-friendly.

Emphasize:

- UAV identity;
- status;
- battery;
- mission assignment when useful.

### Map

Show only operationally relevant overlays:

- UAV positions;
- selected/warning UAV labels;
- mission polygon;
- planned route;
- completed trail;
- waypoints.

Do not display a permanent label for every UAV at all zoom levels.

### UAV Inspector

Default closed.

When a UAV is selected, show:

- identity/state;
- simulated video;
- battery;
- altitude;
- speed;
- heading;
- signal;
- GPS;
- last update;
- mission/waypoint progress;
- Follow action.

### Mission status

Compact and secondary to the map.

Show:

- state;
- progress;
- coverage;
- active UAV count;
- ETA.

### Incidents

Critical/warning events appear with clear action.

Example:

```text
LOW BATTERY
UAV-03 · 18%

[ Inspect ]
```

`Inspect` focuses the real UAV state and opens the inspector.

---

## 12. Motion

Motion supports orientation, not decoration.

Use:

- subtle panel transitions;
- restrained state transitions;
- smooth Cesium camera fly-to;
- smooth UAV interpolation.

Avoid animating static information unnecessarily.

Respect `prefers-reduced-motion`.

---

## 13. Accessibility

Required:

- visible keyboard focus;
- native controls where appropriate;
- labels for icon-only actions;
- sufficient contrast in both themes;
- keyboard-accessible menus and dialogs;
- reduced-motion support.

Operational status should not rely on color alone.

---

## 14. Hardcoded value rule

Application components must not contain raw design values when a token can represent them.

Avoid outside token sources:

- raw hex/rgb colors;
- arbitrary shadows;
- arbitrary radii;
- arbitrary font sizes;
- arbitrary visual spacing.

Runtime values are allowed where genuinely dynamic:

- map coordinates;
- calculated transforms;
- progress widths;
- Cesium positioning;
- dynamic canvas/layout measurements.

---

## 15. UI package boundary

`@horizon/ui` contains generic design-system concerns only.

It must not know about:

- UAV;
- missions;
- telemetry;
- incidents;
- Cesium.

Feature components compose generic primitives into domain-specific UI.

Example:

```text
BaseSurface
+ BaseText
+ BaseBadge
+ BaseMetric
        ↓
UavInspector.vue
```

---

## 16. Review checklist

Before considering UI work complete:

- semantic tokens are used;
- both themes remain coherent;
- typography uses defined variants;
- repeated chrome uses a primitive;
- status colors carry real meaning;
- no unnecessary visual noise was added;
- keyboard focus is visible;
- map remains visually dominant;
- feature code contains no avoidable raw design values.

# Technology Stack

## Runtime

```text
Vue 3
TypeScript
Vite
Vue Router
Pinia
@tanstack/vue-query
CesiumJS
Zod
class-variance-authority
```

## Styling

```text
TailwindCSS
first-party UI primitives
CSS-variable design tokens
```

## Testing

```text
Vitest
Vue Test Utils
Playwright
```

## Tooling

```text
pnpm workspaces
TypeScript strict mode
vue-tsc
ESLint
Prettier
prettier-plugin-tailwindcss
GitHub Actions CI
```

## HTTP

TanStack Query does not provide an HTTP client.

Preferred stack:

```text
TanStack Vue Query
→ repository
→ small HttpClient wrapper
→ native fetch
```

The HTTP wrapper may centralize:

- base URL;
- headers;
- JSON parsing;
- domain error mapping;
- AbortSignal handling.

Do not add Axios unless a real requirement appears.

## Server-state ownership

TanStack Query handles cache, request lifecycle, retry, refetch, invalidation, stale/fresh behavior and mutation state.

## Realtime ownership

WebSocket telemetry is not primarily stored in Query cache.

Use:

```text
Realtime transport
→ validation/buffer
→ Pinia
→ Vue/Cesium
```

## Deliberately not included initially

```text
Nuxt
Turborepo
Nx
Axios
RxJS
Storybook
Husky
MUI
Vuetify
PrimeVue
Bootstrap
SCSS
```

These can be introduced later only if a concrete requirement justifies them.

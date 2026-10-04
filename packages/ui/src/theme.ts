import { readonly, ref } from 'vue'

export type Theme = 'light' | 'dark'

/** Also read by the pre-paint script in apps/control-center/index.html; keep them in sync. */
const STORAGE_KEY = 'horizon.theme'

const theme = ref<Theme>('dark')

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(next: Theme) {
  theme.value = next
  document.documentElement.dataset.theme = next
}

/** Applies the stored or system theme. Call once during bootstrap, before mounting. */
export function initTheme() {
  applyTheme(readInitialTheme())
}

/**
 * Theme switching happens only at the semantic-token layer via `data-theme`.
 * Components never branch on the theme to pick colors.
 */
export function useTheme() {
  function setTheme(next: Theme) {
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore persistence failures; the theme still applies for this session.
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme: readonly(theme), setTheme, toggleTheme }
}

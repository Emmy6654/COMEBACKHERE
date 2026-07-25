import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

const THEME_STORAGE_KEY = "comebackhere-theme"

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark"
}

function getStoredTheme(): Theme | null {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isTheme(storedTheme) ? storedTheme : null
}

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function useTheme() {
  const [hasManualPreference, setHasManualPreference] = useState(
    () => getStoredTheme() !== null,
  )
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (!hasManualPreference) {
        setTheme(event.matches ? "dark" : "light")
      }
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange)
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange)
  }, [hasManualPreference])

  const toggleTheme = () => {
    setHasManualPreference(true)
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark"
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      return nextTheme
    })
  }

  return { theme, toggleTheme }
}

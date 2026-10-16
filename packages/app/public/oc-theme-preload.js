;(function () {
  // Preferences saved before the brand rename live under paper_fucker-*; read them once and re-home
  // them under the current keys so an upgrade does not reset the user's theme.
  function readMigrated(key, legacyKey) {
    var value = localStorage.getItem(key)
    if (value === null) {
      value = localStorage.getItem(legacyKey)
      if (value !== null) localStorage.setItem(key, value)
    }
    return value
  }

  var key = "papercode-theme-id"
  var themeId = readMigrated(key, "paper_fucker-theme-id") || "oc-2"

  if (themeId === "oc-1") {
    themeId = "oc-2"
    localStorage.setItem(key, themeId)
    localStorage.removeItem("papercode-theme-css-light")
    localStorage.removeItem("papercode-theme-css-dark")
  }

  var scheme = readMigrated("papercode-color-scheme", "paper_fucker-color-scheme") || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode

  if (themeId === "oc-2") return

  var css = localStorage.getItem("papercode-theme-css-" + mode)
  if (css) {
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()

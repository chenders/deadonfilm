/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GA_MEASUREMENT_ID?: string
  readonly VITE_NEW_RELIC_BROWSER_LICENSE_KEY?: string
  readonly VITE_NEW_RELIC_BROWSER_APP_ID?: string
  readonly VITE_NEW_RELIC_BROWSER_ACCOUNT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

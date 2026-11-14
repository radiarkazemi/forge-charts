/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CP_FETCHER_ENABLED?: string;
  readonly VITE_TV_LIBRARY_PATH?: string;
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  /** Public Google Identity Services client id. Empty disables Continue with Google. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

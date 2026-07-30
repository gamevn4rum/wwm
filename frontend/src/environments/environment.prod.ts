export const environment = {
  production: true,
  // Injected at build time from the DATA_ENCRYPTION_KEY repo secret (see
  // .github/workflows/deploy.yml). NOTE: this key necessarily ships to the
  // browser, so it is obfuscation, not confidentiality — see SECURITY.md.
  // Only used while useBackend is false (the static path). Keep it: the data/*.enc
  // payloads are still the only copy of anything the backend has not been given.
  dataEncryptionKey: 'YOUR_DATA_ENCRYPTION_KEY',
  // The backend is live and holds every source the static path served — roster,
  // schedule, events, match history and footage from the sheet, and the wwmdb-derived
  // player stats / catalogues / guild data restored from data/*.json (wwmdb itself is
  // gone; see the backend repo's RUNBOOK Phase 6a).
  useBackend: true,
  // Not a secret, so it is committed rather than injected like the key above. This is
  // the App Service *hostname*, which does not match the resource name `app-wwm`.
  // It must also appear in connect-src in index.html or the browser blocks every call.
  apiBaseUrl: 'https://app-wwm-b4dffrbmdnfbcngj.southeastasia-01.azurewebsites.net/api',
};

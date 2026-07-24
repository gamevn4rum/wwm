export const environment = {
  production: false,
  // The static path: reads the prebuilt data/*.json (dev) or data/*.enc (prod).
  // Empty in dev — MembersDataService/MatchHistoryDataService read plaintext JSON.
  dataEncryptionKey: '',
  // When true, the SPA talks to the .NET backend (server-side auth boundary,
  // JWT-gated data) instead of the static data files. Off by default so the
  // existing static path keeps working until the backend is deployed.
  useBackend: false,
  apiBaseUrl: 'http://localhost:5080/api',
};

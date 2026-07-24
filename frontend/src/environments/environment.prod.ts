export const environment = {
  production: true,
  // Injected at build time from the DATA_ENCRYPTION_KEY repo secret (see
  // .github/workflows/deploy.yml). NOTE: this key necessarily ships to the
  // browser, so it is obfuscation, not confidentiality — see SECURITY.md.
  // Only used while useBackend is false (the static path).
  dataEncryptionKey: 'YOUR_DATA_ENCRYPTION_KEY',
  // Flip to true (and set apiBaseUrl) once the backend is live to move to the
  // real server-side trust boundary. Injected at build time.
  useBackend: false,
  apiBaseUrl: 'YOUR_API_BASE_URL',
};

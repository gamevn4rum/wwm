export const environment = {
  production: true,
  // Injected at build time from the DATA_ENCRYPTION_KEY repo secret (see
  // .github/workflows/deploy.yml). NOTE: this key necessarily ships to the
  // browser, so it is obfuscation, not confidentiality — see SECURITY.md.
  dataEncryptionKey: 'YOUR_DATA_ENCRYPTION_KEY',
};

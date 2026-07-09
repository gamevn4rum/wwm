export const environment = {
  production: false,
  // The app is static-only: it reads the prebuilt data/*.json (dev) or
  // data/*.enc (prod) files and never calls the Google Sheets API from the
  // browser, so no API key or spreadsheet ID is shipped to the client.
  // Empty in dev — MembersDataService/MatchHistoryDataService read plaintext JSON.
  dataEncryptionKey: '',
};

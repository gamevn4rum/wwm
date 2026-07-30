export const environment = {
  production: true,
  // Not a secret, so it is committed rather than injected at build time. This is the App
  // Service *hostname*, which does not match the resource name `app-wwm`. It must also
  // appear in connect-src in index.html or the browser blocks every call.
  apiBaseUrl: 'https://app-wwm-b4dffrbmdnfbcngj.southeastasia-01.azurewebsites.net/api',
};

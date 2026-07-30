export const environment = {
  production: false,
  // Every read goes through the .NET backend. Point this at a locally running
  // Wwm.Api, or at the App Service if you want dev against real data.
  apiBaseUrl: 'http://localhost:5080/api',
};

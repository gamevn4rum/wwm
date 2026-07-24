using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Wwm.Sync.Sync;

namespace Wwm.Sync.Functions;

/// <summary>Admin-key-protected on-demand sync ("sync now" after an edit).
/// The API forwards here with the shared X-Admin-Key header (PLAN §7).</summary>
public sealed class ManualSyncHttpFn(SyncService sync, IConfiguration cfg, ILogger<ManualSyncHttpFn> log)
{
    [Function("ManualSyncHttpFn")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "sync/{source}")] HttpRequestData req,
        string source, CancellationToken ct)
    {
        var adminKey = cfg["ADMIN_KEY"];
        var provided = req.Headers.TryGetValues("X-Admin-Key", out var vals) ? vals.FirstOrDefault() : null;
        if (string.IsNullOrEmpty(adminKey) || provided != adminKey)
            return req.CreateResponse(HttpStatusCode.Unauthorized);

        try
        {
            await sync.RunSourceAsync(source, ct);
            return req.CreateResponse(HttpStatusCode.OK);
        }
        catch (ArgumentException)
        {
            return req.CreateResponse(HttpStatusCode.BadRequest);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Manual sync '{Source}' failed", source);
            return req.CreateResponse(HttpStatusCode.InternalServerError);
        }
    }
}

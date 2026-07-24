using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Wwm.Sync.Sync;

namespace Wwm.Sync.Functions;

/// <summary>Timer-triggered Google Sheet sync. Cadence is configurable via the
/// SYNC_CRON_SHEET app setting (default every 6 h).</summary>
public sealed class SheetSyncFn(SyncService sync, ILogger<SheetSyncFn> log)
{
    [Function("SheetSyncFn")]
    public async Task Run([TimerTrigger("%SYNC_CRON_SHEET%")] TimerInfo timer, CancellationToken ct)
    {
        log.LogInformation("SheetSyncFn started");
        await sync.RunSheetSyncAsync(ct);
    }
}

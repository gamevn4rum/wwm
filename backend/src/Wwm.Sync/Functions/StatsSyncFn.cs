using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Wwm.Sync.Sync;

namespace Wwm.Sync.Functions;

/// <summary>Timer-triggered wwmdb stats + catalogue sync (default daily). Gentle
/// on the third-party relay; cadence via the SYNC_CRON_STATS app setting.</summary>
public sealed class StatsSyncFn(SyncService sync, ILogger<StatsSyncFn> log)
{
    [Function("StatsSyncFn")]
    public async Task Run([TimerTrigger("%SYNC_CRON_STATS%")] TimerInfo timer, CancellationToken ct)
    {
        log.LogInformation("StatsSyncFn started");
        await sync.RunStatsSyncAsync(ct);
    }
}

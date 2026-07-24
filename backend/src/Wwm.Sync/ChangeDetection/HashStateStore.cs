using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Wwm.Sync.ChangeDetection;

/// <summary>
/// The last-applied hash per source, kept in Function Storage (a blob) — cheap,
/// not SQL. Comparing here lets the sync skip waking the DB when nothing changed
/// (PLAN §6). On any storage error it returns null (⇒ treat as changed) so a
/// storage blip never silently drops a real update.
/// </summary>
public sealed class HashStateStore
{
    private readonly BlobContainerClient? _container;
    private readonly ILogger<HashStateStore> _log;

    public HashStateStore(IConfiguration cfg, ILogger<HashStateStore> log)
    {
        _log = log;
        var conn = cfg["AzureWebJobsStorage"];
        try
        {
            if (!string.IsNullOrEmpty(conn))
            {
                _container = new BlobServiceClient(conn).GetBlobContainerClient("sync-state");
                _container.CreateIfNotExists();
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Hash-state storage unavailable; syncs will not skip-on-unchanged.");
            _container = null;
        }
    }

    public async Task<string?> GetAsync(string source, CancellationToken ct)
    {
        if (_container is null) return null;
        try
        {
            var blob = _container.GetBlobClient(source);
            if (!await blob.ExistsAsync(ct)) return null;
            var content = await blob.DownloadContentAsync(ct);
            return content.Value.Content.ToString().Trim();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Reading hash for {Source} failed.", source);
            return null;
        }
    }

    public async Task SetAsync(string source, string hash, CancellationToken ct)
    {
        if (_container is null) return;
        try
        {
            await _container.GetBlobClient(source).UploadAsync(BinaryData.FromString(hash), overwrite: true, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Writing hash for {Source} failed.", source);
        }
    }
}

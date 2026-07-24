using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Wwm.Data;

namespace Wwm.Api.Services;

/// <summary>
/// Reads feature flags with a short in-process cache so the flag check on hot
/// public/member routes rarely wakes SQL (PLAN §6). Missing key ⇒ enabled.
/// </summary>
public sealed class FeatureFlagService(WwmDbContext db, IMemoryCache cache)
{
    private const string CacheKey = "feature-flags";
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    public async Task<IReadOnlyDictionary<string, bool>> GetAllAsync(CancellationToken ct)
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyDictionary<string, bool>? cached) && cached is not null)
            return cached;

        var map = await db.FeatureFlags
            .AsNoTracking()
            .ToDictionaryAsync(f => f.Key, f => f.Enabled, ct);

        cache.Set(CacheKey, (IReadOnlyDictionary<string, bool>)map, Ttl);
        return map;
    }

    public async Task<bool> IsEnabledAsync(string key, CancellationToken ct)
    {
        var all = await GetAllAsync(ct);
        return !all.TryGetValue(key, out var enabled) || enabled;
    }

    public void Invalidate() => cache.Remove(CacheKey);
}

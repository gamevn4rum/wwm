using Microsoft.EntityFrameworkCore;
using Wwm.Data;
using Wwm.Data.Entities;

namespace Wwm.Api.Services;

/// <summary>Seeds one FeatureFlag row per toggleable route (all enabled) so the
/// admin dashboard has rows to manage (PLAN §9A). Idempotent. Member roles
/// (shinigamae=Admin, Caller→Commander) bootstrap during the first sheet sync.</summary>
public static class Seeder
{
    public static async Task SeedFeatureFlagsAsync(WwmDbContext db, CancellationToken ct = default)
    {
        var existing = await db.FeatureFlags.Select(f => f.Key).ToListAsync(ct);
        var existingSet = existing.ToHashSet();

        var added = false;
        foreach (var (key, label) in FeatureKeys.Seed)
        {
            if (existingSet.Contains(key)) continue;
            db.FeatureFlags.Add(new FeatureFlag { Key = key, Enabled = true, Label = label });
            added = true;
        }
        if (added) await db.SaveChangesAsync(ct);
    }
}

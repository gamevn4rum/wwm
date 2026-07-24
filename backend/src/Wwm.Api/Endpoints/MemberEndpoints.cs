using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Wwm.Api.Auth;
using Wwm.Api.Services;
using Wwm.Core.Mapping;
using Wwm.Data;

namespace Wwm.Api.Endpoints;

public static class MemberEndpoints
{
    public static void MapMemberEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/member").RequireAuthorization(ApiConstants.PolicyMember);

        // Full roster (any authenticated member) — includes Discord handle.
        group.MapGet("/roster", async (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            CancellationToken ct) =>
            await ResponseCache.ServeMember(ctx, cache, "mem:roster", 60, async () =>
            {
                var members = await db.Members.AsNoTracking().OrderBy(m => m.Id).ToListAsync(ct);
                return members.Select(DtoMappers.ToMemberDto).ToList();
            }));

        // Formation tool data (requires fp).
        group.MapGet("/formation", async (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            FeatureFlagService flags, CancellationToken ct) =>
        {
            if (!await flags.IsEnabledAsync(FeatureKeys.PageFormation, ct)) return Results.NotFound();
            return await ResponseCache.ServeMember(ctx, cache, "mem:formation", 60, async () =>
            {
                var members = await db.Members.AsNoTracking().OrderBy(m => m.Id).ToListAsync(ct);
                return members.Select(DtoMappers.ToMemberDto).ToList();
            });
        }).RequireAuthorization(ApiConstants.PolicyFp);

        // Player stats (any member) — served straight from stored JSON.
        group.MapGet("/player-stats", async (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            FeatureFlagService flags, CancellationToken ct) =>
        {
            if (!await flags.IsEnabledAsync(FeatureKeys.PageRosterStats, ct)) return Results.NotFound();
            return await ResponseCache.ServeMemberRaw(ctx, cache, "mem:player-stats", 300, async () =>
            {
                var stats = await db.PlayerStats.AsNoTracking().OrderBy(p => p.Ign).ToListAsync(ct);
                return GameDataJson.BuildPlayerStats(stats);
            });
        });

        // Static catalogues (any member).
        group.MapGet("/inner-ways", (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            FeatureFlagService flags, CancellationToken ct) =>
            ServeCatalogue(ctx, db, cache, flags, ct, "mem:inner-ways",
                db.InnerWayCatalogues.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Data)));

        group.MapGet("/sets", (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            FeatureFlagService flags, CancellationToken ct) =>
            ServeCatalogue(ctx, db, cache, flags, ct, "mem:sets",
                db.SetCatalogues.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Data)));

        // Match history (any member) — footage URLs included only with ftp.
        group.MapGet("/matches", async (HttpContext ctx, WwmDbContext db,
            IMemoryCache cache, FeatureFlagService flags, CancellationToken ct) =>
        {
            if (!await flags.IsEnabledAsync(FeatureKeys.PageMatchHistory, ct)) return Results.NotFound();
            var withFootage = ctx.User.HasFtp();
            return await ResponseCache.ServeMember(ctx, cache, $"mem:matches:{withFootage}", 120, async () =>
            {
                var matches = await LoadMatches(db, ct);
                return matches.Select(m => DtoMappers.ToMatchDto(m, withFootage)).ToList();
            });
        });

        // Flattened footages (requires ftp).
        group.MapGet("/footages", async (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            FeatureFlagService flags, CancellationToken ct) =>
        {
            if (!await flags.IsEnabledAsync(FeatureKeys.PageFootages, ct)) return Results.NotFound();
            return await ResponseCache.ServeMember(ctx, cache, "mem:footages", 120, async () =>
            {
                var matches = await LoadMatches(db, ct);
                return matches.SelectMany(DtoMappers.ToFootageRecords).ToList();
            });
        }).RequireAuthorization(ApiConstants.PolicyFtp);
    }

    private static Task<List<Wwm.Data.Entities.Match>> LoadMatches(WwmDbContext db, CancellationToken ct) =>
        db.Matches.AsNoTracking()
            .Include(m => m.OppGuild)
            .Include(m => m.Season)
            .Include(m => m.Footages)
            .OrderByDescending(m => m.DateTime).ThenByDescending(m => m.Id)
            .ToListAsync(ct);

    private static async Task<IResult> ServeCatalogue(HttpContext ctx, WwmDbContext db, IMemoryCache cache,
        FeatureFlagService flags, CancellationToken ct, string key, IQueryable<string> dataQuery)
    {
        if (!await flags.IsEnabledAsync(FeatureKeys.PageRosterStats, ct)) return Results.NotFound();
        return await ResponseCache.ServeMemberRaw(ctx, cache, key, 3600,
            async () => GameDataJson.BuildCatalogue(await dataQuery.ToListAsync(ct)));
    }
}

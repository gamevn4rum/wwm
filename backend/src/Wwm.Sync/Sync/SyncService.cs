using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wwm.Core.Mapping;
using Wwm.Core.Sheets;
using Wwm.Core.Util;
using Wwm.Core.Wwmdb;
using Wwm.Data;
using Wwm.Data.Entities;
using Wwm.Sync.ChangeDetection;

namespace Wwm.Sync.Sync;

/// <summary>
/// The one component that opens SQL in the sync path — and only when a source's
/// hash changed (PLAN §6). Fetch → hash → compare (Function Storage, no SQL) →
/// upsert only on change. Members keep the [S]/[A] ownership split (PLAN §9).
/// </summary>
public sealed class SyncService(
    WwmDbContext db, GoogleSheetsClient sheets, WwmdbClient wwmdb,
    HashStateStore hashes, ILogger<SyncService> log)
{
    private delegate Task Upsert(List<SheetRow> rows, string hash, CancellationToken ct);

    // ── Entry points ─────────────────────────────────────────────────────
    public async Task RunSheetSyncAsync(CancellationToken ct)
    {
        await RunSheetSourceAsync("members", "Members!A:Z", MembersHash, UpsertMembersAsync, ct);
        await RunSheetSourceAsync("schedule", "Schedule!A:Z", RowsHash, ReplaceScheduleAsync, ct);
        await RunSheetSourceAsync("matches", "Match History!A:Z", RowsHash, UpsertMatchesAsync, ct);
        await RunSheetSourceAsync("events", "Events!A:J", RowsHash, ReplaceEventsAsync, ct);
    }

    public async Task RunStatsSyncAsync(CancellationToken ct)
    {
        await SyncCatalogueAsync("inner-ways", await wwmdb.FetchInnerWaysAsync(ct), db.InnerWayCatalogues, ct);
        await SyncCatalogueAsync("sets", await wwmdb.FetchSuitsAsync(ct), db.SetCatalogues, ct);
        await SyncPlayerStatsAsync(ct);
    }

    /// <summary>Dispatch a single source (manual admin trigger).</summary>
    public async Task RunSourceAsync(string source, CancellationToken ct)
    {
        switch (source)
        {
            case "members": await RunSheetSourceAsync("members", "Members!A:Z", MembersHash, UpsertMembersAsync, ct); break;
            case "schedule": await RunSheetSourceAsync("schedule", "Schedule!A:Z", RowsHash, ReplaceScheduleAsync, ct); break;
            case "matches": await RunSheetSourceAsync("matches", "Match History!A:Z", RowsHash, UpsertMatchesAsync, ct); break;
            case "events": await RunSheetSourceAsync("events", "Events!A:J", RowsHash, ReplaceEventsAsync, ct); break;
            case "inner-ways": await SyncCatalogueAsync("inner-ways", await wwmdb.FetchInnerWaysAsync(ct), db.InnerWayCatalogues, ct); break;
            case "sets": await SyncCatalogueAsync("sets", await wwmdb.FetchSuitsAsync(ct), db.SetCatalogues, ct); break;
            case "player-stats": await SyncPlayerStatsAsync(ct); break;
            case "sheet": await RunSheetSyncAsync(ct); break;
            case "stats": await RunStatsSyncAsync(ct); break;
            case "all": await RunSheetSyncAsync(ct); await RunStatsSyncAsync(ct); break;
            default: throw new ArgumentException($"unknown sync source '{source}'");
        }
    }

    // ── Sheet source runner ──────────────────────────────────────────────
    private async Task RunSheetSourceAsync(
        string source, string range, Func<List<SheetRow>, string> hashFn, Upsert upsert, CancellationToken ct)
    {
        try
        {
            var rows = await sheets.FetchRangeAsync(range, ct);
            var newHash = hashFn(rows);
            if (await hashes.GetAsync(source, ct) == newHash)
            {
                log.LogInformation("– {Source}: unchanged ({Rows} rows), SQL not touched", source, rows.Count);
                return;
            }
            await upsert(rows, newHash, ct);
            await hashes.SetAsync(source, newHash, ct);
            log.LogInformation("✓ {Source}: applied ({Rows} rows)", source, rows.Count);
        }
        catch (Exception ex)
        {
            // Keep last-good: leave SQL untouched and don't fail the whole run.
            log.LogWarning(ex, "⚠ {Source}: sync failed, kept last-good", source);
        }
    }

    // ── Members: [S]/[A] ownership split ─────────────────────────────────
    private async Task UpsertMembersAsync(List<SheetRow> rows, string hash, CancellationToken ct)
    {
        var mapped = rows.Select(MemberMapper.FromRow).OfType<Member>().ToList();
        var existing = (await db.Members.ToListAsync(ct))
            .ToDictionary(m => m.Ign, StringComparer.OrdinalIgnoreCase);

        foreach (var m in mapped)
        {
            if (existing.TryGetValue(m.Ign, out var e))
            {
                // UPDATE writes only [S] sheet-owned columns; [A] fields preserved.
                e.Discord = m.Discord;
                e.MainWeapon = m.MainWeapon;
                e.SecondaryWeapon = m.SecondaryWeapon;
                e.Team = m.Team;
                e.Saturday = m.Saturday;
                e.Sunday = m.Sunday;
                e.Notes = m.Notes;
            }
            else
            {
                db.Members.Add(m); // INSERT sets all columns incl. [A] bootstrap
            }
        }
        await StampAndSaveAsync("members", hash, ct);
    }

    // ── Events / Schedule: regenerated wholesale ─────────────────────────
    private async Task ReplaceEventsAsync(List<SheetRow> rows, string hash, CancellationToken ct)
    {
        var mapped = rows.Select(EventMapper.FromRow).OfType<Event>().ToList();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Events.ExecuteDeleteAsync(ct);
        await db.Events.AddRangeAsync(mapped, ct);
        await StampAndSaveAsync("events", hash, ct);
        await tx.CommitAsync(ct);
    }

    private async Task ReplaceScheduleAsync(List<SheetRow> rows, string hash, CancellationToken ct)
    {
        var mapped = rows.Select(ScheduleMapper.FromRow).OfType<ScheduleItem>().ToList();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.ScheduleItems.ExecuteDeleteAsync(ct);
        await db.ScheduleItems.AddRangeAsync(mapped, ct);
        await StampAndSaveAsync("schedule", hash, ct);
        await tx.CommitAsync(ct);
    }

    // ── Matches: guild/season resolve + upsert by natural key ────────────
    private async Task UpsertMatchesAsync(List<SheetRow> rows, string hash, CancellationToken ct)
    {
        var parsed = rows.Select(MatchMapper.FromRow).OfType<ParsedMatch>().ToList();

        var guildByName = (await db.Guilds.ToListAsync(ct))
            .ToDictionary(g => g.Name, StringComparer.OrdinalIgnoreCase);
        var aliasMap = (await db.GuildAliases.ToListAsync(ct))
            .ToDictionary(a => a.Alias, a => a.GuildId, StringComparer.OrdinalIgnoreCase);
        var seasonByName = (await db.Seasons.ToListAsync(ct))
            .ToDictionary(s => s.Name, StringComparer.OrdinalIgnoreCase);

        foreach (var opp in parsed.Select(p => p.Opponent).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (aliasMap.ContainsKey(opp) || guildByName.ContainsKey(opp)) continue;
            var g = new Guild { Name = opp };
            db.Guilds.Add(g);
            guildByName[opp] = g;
        }
        foreach (var sn in parsed.Select(p => p.Season).Where(s => !string.IsNullOrEmpty(s))
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (seasonByName.ContainsKey(sn!)) continue;
            var s = new Season { Name = sn! };
            db.Seasons.Add(s);
            seasonByName[sn!] = s;
        }
        await db.SaveChangesAsync(ct); // assign new guild/season ids

        int GuildId(string opp) => aliasMap.TryGetValue(opp, out var id) ? id : guildByName[opp].Id;
        int? SeasonId(string? sn) => string.IsNullOrEmpty(sn) ? null : seasonByName[sn].Id;

        var existingByKey = (await db.Matches.Include(m => m.Footages).ToListAsync(ct))
            .ToDictionary(m => MatchKey(m.OppGuildId, m.DateTime, m.Type));

        foreach (var pm in parsed)
        {
            var gId = GuildId(pm.Opponent);
            var key = MatchKey(gId, pm.Date, pm.Type);
            var footages = pm.Footages
                .Select(f => new Footage { Uploader = f.Uploader, YoutubeLink = f.YoutubeLink })
                .ToList();

            if (existingByKey.TryGetValue(key, out var match))
            {
                match.Status = pm.Status;
                match.SeasonId = SeasonId(pm.Season);
                db.Footages.RemoveRange(match.Footages);
                match.Footages = footages;
            }
            else
            {
                match = new Match
                {
                    OppGuildId = gId,
                    DateTime = pm.Date,
                    Type = pm.Type,
                    Status = pm.Status,
                    SeasonId = SeasonId(pm.Season),
                    Footages = footages,
                };
                db.Matches.Add(match);
                existingByKey[key] = match;
            }
        }
        await StampAndSaveAsync("matches", hash, ct);
    }

    private static string MatchKey(int guildId, DateTime? date, string? type) =>
        $"{guildId}|{date:o}|{type}";

    // ── Catalogues (inner-ways / sets) ───────────────────────────────────
    private async Task SyncCatalogueAsync<TEntity>(
        string source, CatalogueResult result, DbSet<TEntity> set, CancellationToken ct)
        where TEntity : class, ICatalogueEntity, new()
    {
        try
        {
            var newHash = CatalogueHash(result);
            if (await hashes.GetAsync(source, ct) == newHash)
            {
                log.LogInformation("– {Source}: unchanged, SQL not touched", source);
                return;
            }
            if (result.AllIds.Count == 0)
            {
                log.LogWarning("⚠ {Source}: list fetch empty, kept last-good", source);
                return;
            }

            var fetched = result.Fetched.ToDictionary(e => e.Id);
            var existing = (await set.AsNoTracking().ToListAsync(ct)).ToDictionary(e => e.Id);

            var final = new List<TEntity>();
            foreach (var id in result.AllIds)
            {
                if (fetched.TryGetValue(id, out var f))
                    final.Add(new TEntity { Id = id, Name = f.Name, Data = f.DataJson });
                else if (existing.TryGetValue(id, out var prev))
                    final.Add(new TEntity { Id = id, Name = prev.Name, Data = prev.Data });
            }

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await set.ExecuteDeleteAsync(ct);
            await set.AddRangeAsync(final, ct);
            await StampAndSaveAsync(source, newHash, ct);
            await tx.CommitAsync(ct);
            await hashes.SetAsync(source, newHash, ct);
            log.LogInformation("✓ {Source}: applied ({Count} entries)", source, final.Count);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "⚠ {Source}: sync failed, kept last-good", source);
        }
    }

    // ── Player stats ─────────────────────────────────────────────────────
    private async Task SyncPlayerStatsAsync(CancellationToken ct)
    {
        try
        {
            // Prefer the sheet for roster IGNs so the fetch loop doesn't wake SQL (PLAN §6).
            var memberRows = await sheets.FetchRangeAsync("Members!A:Z", ct);
            var igns = memberRows.Select(r => r.Val("IGN")).Where(s => s.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s, StringComparer.Ordinal).ToList();

            var results = new List<PlayerStatResult>(igns.Count);
            foreach (var ign in igns)
            {
                try { results.Add(await wwmdb.FetchPlayerAsync(ign, ct)); }
                catch (Exception ex)
                {
                    log.LogWarning("↺ {Ign}: {Message}", ign, ex.Message);
                    results.Add(new PlayerStatResult(ign, false, "error", null, null, null));
                }
                await Task.Delay(wwmdb.MemberDelayMilliseconds, ct);
            }

            var newHash = PlayerStatsHash(results);
            if (await hashes.GetAsync("player-stats", ct) == newHash)
            {
                log.LogInformation("– player-stats: unchanged, SQL not touched");
                return;
            }

            var existing = (await db.PlayerStats.AsNoTracking().ToListAsync(ct))
                .ToDictionary(p => p.Ign, StringComparer.OrdinalIgnoreCase);

            var final = new List<PlayerStat>(results.Count);
            foreach (var r in results)
            {
                // Miss: keep last-good matched stats rather than losing them.
                if (!r.Matched && existing.TryGetValue(r.Ign, out var prev) && prev.Matched)
                    final.Add(new PlayerStat
                    {
                        Ign = prev.Ign, Matched = true, Reason = prev.Reason,
                        Detail = prev.Detail, FoundName = prev.FoundName, FoundRegion = prev.FoundRegion,
                    });
                else
                    final.Add(new PlayerStat
                    {
                        Ign = r.Ign, Matched = r.Matched, Reason = r.Reason,
                        Detail = r.DetailJson, FoundName = r.FoundName, FoundRegion = r.FoundRegion,
                    });
            }

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.PlayerStats.ExecuteDeleteAsync(ct);
            await db.PlayerStats.AddRangeAsync(final, ct);
            await StampAndSaveAsync("player-stats", newHash, ct);
            await tx.CommitAsync(ct);
            await hashes.SetAsync("player-stats", newHash, ct);
            log.LogInformation("✓ player-stats: applied ({Count} records)", final.Count);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "⚠ player-stats: sync failed, kept last-good");
        }
    }

    // ── SyncState + hashing ──────────────────────────────────────────────
    private async Task StampAndSaveAsync(string source, string hash, CancellationToken ct)
    {
        var state = await db.SyncStates.FindAsync([source], ct);
        if (state is null)
            db.SyncStates.Add(new SyncState { Source = source, LastRunUtc = DateTime.UtcNow, LastHash = hash });
        else
        {
            state.LastRunUtc = DateTime.UtcNow;
            state.LastHash = hash;
        }
        await db.SaveChangesAsync(ct);
    }

    private static string RowsHash(List<SheetRow> rows)
    {
        var sb = new StringBuilder();
        foreach (var row in rows)
        {
            foreach (var kv in row.OrderBy(k => k.Key, StringComparer.Ordinal))
                sb.Append(kv.Key).Append('=').Append(kv.Value).Append('');
            sb.Append('\n');
        }
        return Hashing.Sha256Hex(sb.ToString());
    }

    private static string MembersHash(List<SheetRow> rows) =>
        Hashing.Sha256Hex(string.Join('\n', rows.Select(MemberMapper.SheetOwnedSignature)));

    private static string CatalogueHash(CatalogueResult result)
    {
        var sb = new StringBuilder();
        foreach (var id in result.AllIds.OrderBy(i => i)) sb.Append(id).Append(',');
        sb.Append('\n');
        foreach (var e in result.Fetched.OrderBy(e => e.Id))
            sb.Append(e.Id).Append(':').Append(e.DataJson).Append('\n');
        return Hashing.Sha256Hex(sb.ToString());
    }

    private static string PlayerStatsHash(List<PlayerStatResult> results)
    {
        var sb = new StringBuilder();
        foreach (var r in results.OrderBy(r => r.Ign, StringComparer.Ordinal))
            sb.Append(r.Ign).Append('|').Append(r.Matched).Append('|').Append(r.Reason)
              .Append('|').Append(r.DetailJson).Append('|').Append(r.FoundName)
              .Append('|').Append(r.FoundRegion).Append('\n');
        return Hashing.Sha256Hex(sb.ToString());
    }
}

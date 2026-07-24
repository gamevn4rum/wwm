using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Wwm.Api.Services;
using Wwm.Core.Dtos;
using Wwm.Core.Mapping;
using Wwm.Data;
using Wwm.Data.Entities;

namespace Wwm.Api.Endpoints;

public static class PublicEndpoints
{
    public static void MapPublicEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/public");

        // Events — public homepage feed.
        group.MapGet("/events", async (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            FeatureFlagService flags, CancellationToken ct) =>
        {
            if (!await flags.IsEnabledAsync(FeatureKeys.PageEvents, ct)) return Results.NotFound();
            return await ResponseCache.ServePublic(ctx, cache, "pub:events", 300, async () =>
            {
                var events = await db.Events.AsNoTracking()
                    .OrderByDescending(e => e.EventDate).ThenByDescending(e => e.Id)
                    .ToListAsync(ct);
                return events.Select(DtoMappers.ToEventDto).ToList();
            });
        });

        // Schedule — public homepage feed.
        group.MapGet("/schedule", async (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            FeatureFlagService flags, CancellationToken ct) =>
        {
            if (!await flags.IsEnabledAsync(FeatureKeys.PageSchedule, ct)) return Results.NotFound();
            return await ResponseCache.ServePublic(ctx, cache, "pub:schedule", 300, async () =>
            {
                var items = await db.ScheduleItems.AsNoTracking().OrderBy(s => s.Id).ToListAsync(ct);
                return items.Select(DtoMappers.ToScheduleDto).ToList();
            });
        });

        // Safe roster projection for the homepage member grid (no PII, no permissions).
        group.MapGet("/roster", async (HttpContext ctx, WwmDbContext db, IMemoryCache cache,
            CancellationToken ct) =>
            await ResponseCache.ServePublic(ctx, cache, "pub:roster", 60, async () =>
            {
                var members = await db.Members.AsNoTracking().OrderBy(m => m.Id).ToListAsync(ct);
                return members.Select(DtoMappers.ToPublicMember).ToList();
            }));

        // Feature-flag config so the SPA can hide disabled nav/routes (PLAN §9A).
        group.MapGet("/config", async (HttpContext ctx, IMemoryCache cache,
            FeatureFlagService flags, CancellationToken ct) =>
            await ResponseCache.ServePublic(ctx, cache, "pub:config", 60,
                async () => new ConfigDto(await flags.GetAllAsync(ct))));

        // Membership request from the public Register form. Officers review it
        // before any access is granted (PLAN §9A registration flow).
        group.MapPost("/register", async (RegistrationRequest req, WwmDbContext db,
            FeatureFlagService flags, CancellationToken ct) =>
        {
            if (!await flags.IsEnabledAsync(FeatureKeys.FeatureRegister, ct)) return Results.NotFound();

            var discord = req.Discord?.Trim() ?? string.Empty;
            var ign = req.Ign?.Trim() ?? string.Empty;
            if (discord.Length == 0 || ign.Length == 0)
                return Results.BadRequest(new { error = "discord_and_ign_required" });

            // Bound every field to its column size — reject oversized input rather
            // than letting it hit SQL (avoids truncation/500 and payload abuse).
            if (discord.Length > 100 || ign.Length > 100
                || (req.Uid?.Length ?? 0) > 40
                || (req.MainWeapon?.Length ?? 0) > 60 || (req.SecondaryWeapon?.Length ?? 0) > 60
                || (req.Saturday?.Length ?? 0) > 20 || (req.Sunday?.Length ?? 0) > 20
                || (req.Note?.Length ?? 0) > 500)
                return Results.BadRequest(new { error = "field_too_long" });

            // Dedupe: one open request per Discord handle at a time.
            var hasPending = await db.Registrations.AnyAsync(
                r => r.Status == RegistrationStatus.Pending && r.Discord == discord, ct);
            if (hasPending) return Results.Conflict(new { error = "already_pending" });

            db.Registrations.Add(new Registration
            {
                Discord = discord,
                Uid = req.Uid?.Trim(),
                Ign = ign,
                MainWeapon = req.MainWeapon?.Trim(),
                SecondaryWeapon = req.SecondaryWeapon?.Trim(),
                Saturday = req.Saturday?.Trim(),
                Sunday = req.Sunday?.Trim(),
                Note = req.Note?.Trim(),
                Status = RegistrationStatus.Pending,
                SubmittedUtc = DateTime.UtcNow,
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { status = "submitted" });
        }).RequireRateLimiting("register");
    }
}

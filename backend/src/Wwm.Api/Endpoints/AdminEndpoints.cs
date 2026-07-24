using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Wwm.Api.Auth;
using Wwm.Api.Services;
using Wwm.Core.Dtos;
using Wwm.Core.Mapping;
using Wwm.Data;
using Wwm.Data.Entities;

namespace Wwm.Api.Endpoints;

public static partial class AdminEndpoints
{
    [GeneratedRegex(@"^[a-z-]+$")]
    private static partial Regex SourceName();

    public static void MapAdminEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/admin").RequireAuthorization(ApiConstants.PolicyAdmin);

        group.MapGet("/features", async (WwmDbContext db, CancellationToken ct) =>
        {
            var flags = await db.FeatureFlags.AsNoTracking().OrderBy(f => f.Key).ToListAsync(ct);
            return Results.Ok(flags.Select(DtoMappers.ToFeatureFlagDto).ToList());
        });

        group.MapPatch("/features/{key}", async (
            string key, FeaturePatchDto patch, HttpContext ctx, WwmDbContext db,
            FeatureFlagService flagCache, IMemoryCache cache, CancellationToken ct) =>
        {
            var actor = ctx.User.Username();
            var flag = await db.FeatureFlags.FirstOrDefaultAsync(f => f.Key == key, ct);
            var before = flag is null ? null : JsonSerializer.Serialize(new { flag.Enabled });

            if (flag is null)
            {
                flag = new FeatureFlag { Key = key, Enabled = patch.Enabled };
                db.FeatureFlags.Add(flag);
            }
            else
            {
                flag.Enabled = patch.Enabled;
            }
            flag.UpdatedBy = actor;
            flag.UpdatedUtc = DateTime.UtcNow;

            db.AuditLogs.Add(new AuditLog
            {
                ActorName = actor,
                Action = "feature.toggle",
                TargetType = "FeatureFlag",
                TargetId = key,
                BeforeJson = before,
                AfterJson = JsonSerializer.Serialize(new { flag.Enabled }),
                Utc = DateTime.UtcNow,
            });
            await db.SaveChangesAsync(ct);

            flagCache.Invalidate();
            cache.Remove("pub:config");
            return Results.Ok(DtoMappers.ToFeatureFlagDto(flag));
        });

        group.MapGet("/audit", async (WwmDbContext db, CancellationToken ct) =>
        {
            var entries = await db.AuditLogs.AsNoTracking()
                .OrderByDescending(a => a.Utc).Take(200).ToListAsync(ct);
            return Results.Ok(entries.Select(DtoMappers.ToAuditDto).ToList());
        });

        // On-demand sync — forwards to the Function's admin-key-protected HTTP trigger.
        group.MapPost("/sync/{source}", async (
            string source, IConfiguration cfg, IHttpClientFactory httpFactory, CancellationToken ct) =>
        {
            if (!SourceName().IsMatch(source)) return Results.BadRequest(new { error = "invalid_source" });

            var url = cfg["FUNCTION_SYNC_URL"];
            var adminKey = cfg["ADMIN_KEY"];
            if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(adminKey))
                return Results.Json(new { error = "sync_trigger_not_configured" }, statusCode: 501);

            using var client = httpFactory.CreateClient();
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{url.TrimEnd('/')}/{source}");
            req.Headers.Add("X-Admin-Key", adminKey);
            using var res = await client.SendAsync(req, ct);
            return Results.StatusCode((int)res.StatusCode);
        });
    }
}

using Microsoft.EntityFrameworkCore;
using Wwm.Api.Auth;
using Wwm.Core;
using Wwm.Core.Dtos;
using Wwm.Data;

namespace Wwm.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        // Discord Authorization Code exchange → app JWT (PLAN §8).
        group.MapPost("/discord/exchange", async (
            DiscordExchangeRequest req, DiscordClient discord, WwmDbContext db,
            TokenService tokens, ILoggerFactory lf, CancellationToken ct) =>
        {
            var log = lf.CreateLogger("auth");
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.RedirectUri))
                return Results.BadRequest();

            DiscordProfile? profile;
            try
            {
                profile = await discord.ExchangeAndFetchAsync(req.Code, req.RedirectUri, ct);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Discord exchange failed (configuration?)");
                return Results.Json(new { error = "server_error" }, statusCode: 500);
            }
            if (profile is null)
                return Results.Json(new { error = "invalid_token" }, statusCode: 401);

            var member = await db.Members.AsNoTracking()
                .FirstOrDefaultAsync(m => m.Discord != null && m.Discord == profile.Username, ct);
            if (member is null)
                return Results.Json(new { error = "not_a_member" }, statusCode: 403);
            if (!member.CanLogin)
                return Results.Json(new { error = "login_disabled" }, statusCode: 403);

            var role = Roles.Normalize(member.Role);
            var token = tokens.Issue(profile.Username, role, member.FormationPermission, member.FootagePermission);
            var session = new DiscordUserSession(
                profile.Username,
                DiscordClient.BuildAvatarUrl(profile.Id, profile.Avatar),
                IsAuthorized: true, role, member.CanLogin,
                member.FormationPermission, member.FootagePermission);

            return Results.Ok(new AuthResponse(token, session));
        }).RequireRateLimiting("auth");

        // Local-dev bypass (PLAN §8) — only when explicitly enabled AND never in
        // a Production environment (double guard so it can't leak into prod).
        group.MapPost("/dev", (TokenService tokens, IConfiguration cfg, IHostEnvironment env) =>
        {
            if (cfg["DEV_AUTH_ENABLED"] != "true" || env.IsProduction()) return Results.NotFound();
            var token = tokens.Issue("Shinigamae", Roles.Admin, fp: true, ftp: true);
            var session = new DiscordUserSession(
                "Shinigamae", "https://cdn.discordapp.com/embed/avatars/0.png",
                IsAuthorized: true, Roles.Admin, CanLogin: true, Fp: true, Ftp: true);
            return Results.Ok(new AuthResponse(token, session));
        });
    }
}

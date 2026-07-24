using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Wwm.Core;

namespace Wwm.Api.Auth;

/// <summary>Issues short-lived HMAC-signed app JWTs (PLAN §8). Role/permission
/// claims come from the app-managed Member row, never the client.</summary>
public sealed class TokenService(IConfiguration config)
{
    public string Issue(string username, string role, bool fp, bool ftp)
    {
        var secret = config["JWT_SIGNING_KEY"]
            ?? throw new InvalidOperationException("JWT_SIGNING_KEY is not configured.");
        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), SecurityAlgorithms.HmacSha256);

        var now = DateTime.UtcNow;
        var identity = new ClaimsIdentity(
        [
            new Claim(JwtRegisteredClaimNames.Sub, username),
            new Claim(ApiConstants.ClaimRole, role),
            new Claim(ApiConstants.ClaimFp, fp ? "true" : "false"),
            new Claim(ApiConstants.ClaimFtp, ftp ? "true" : "false"),
        ]);

        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = ApiConstants.JwtIssuer,
            Audience = ApiConstants.JwtAudience,
            Subject = identity,
            NotBefore = now,
            Expires = now.AddHours(1),
            SigningCredentials = creds,
        });
    }
}

public sealed record DiscordProfile(string Id, string Username, string? Avatar);

/// <summary>Discord Authorization Code flow (PLAN §8): the server holds the client
/// secret and exchanges the code for a token, then reads the user profile. The
/// token never rides through the browser.</summary>
public sealed class DiscordClient(HttpClient http, IConfiguration config)
{
    public async Task<DiscordProfile?> ExchangeAndFetchAsync(
        string code, string redirectUri, CancellationToken ct)
    {
        var clientId = config["DISCORD_CLIENT_ID"];
        var clientSecret = config["DISCORD_CLIENT_SECRET"];
        if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
            throw new InvalidOperationException("Discord client id/secret not configured.");

        using var tokenRes = await http.PostAsync("https://discord.com/api/oauth2/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = redirectUri,
            }), ct);
        if (!tokenRes.IsSuccessStatusCode) return null;

        using var tokenDoc = JsonDocument.Parse(await tokenRes.Content.ReadAsStringAsync(ct));
        if (!tokenDoc.RootElement.TryGetProperty("access_token", out var at)) return null;
        var accessToken = at.GetString();
        if (string.IsNullOrEmpty(accessToken)) return null;

        using var meReq = new HttpRequestMessage(HttpMethod.Get, "https://discord.com/api/users/@me");
        meReq.Headers.Add("Authorization", $"Bearer {accessToken}");
        using var meRes = await http.SendAsync(meReq, ct);
        if (!meRes.IsSuccessStatusCode) return null;

        using var meDoc = JsonDocument.Parse(await meRes.Content.ReadAsStringAsync(ct));
        var root = meDoc.RootElement;
        var id = root.GetProperty("id").GetString();
        var username = root.GetProperty("username").GetString();
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(username)) return null;
        var avatar = root.TryGetProperty("avatar", out var av) ? av.GetString() : null;

        return new DiscordProfile(id, username, avatar);
    }

    /// <summary>Port of buildAvatarUrl in discord-auth.service.ts.</summary>
    public static string BuildAvatarUrl(string id, string? avatar)
    {
        if (string.IsNullOrEmpty(avatar))
        {
            var idx = ulong.TryParse(id, out var n) ? n % 5 : 0;
            return $"https://cdn.discordapp.com/embed/avatars/{idx}.png";
        }
        var ext = avatar.StartsWith("a_", StringComparison.Ordinal) ? "gif" : "png";
        return $"https://cdn.discordapp.com/avatars/{id}/{avatar}.{ext}?size=128";
    }
}

public static class UserExtensions
{
    public static string Username(this ClaimsPrincipal user) =>
        user.FindFirst(JwtRegisteredClaimNames.Sub)?.Value ?? string.Empty;

    public static string Role(this ClaimsPrincipal user) =>
        Roles.Normalize(user.FindFirst(ApiConstants.ClaimRole)?.Value);

    public static bool HasFp(this ClaimsPrincipal user) =>
        user.FindFirst(ApiConstants.ClaimFp)?.Value == "true";

    public static bool HasFtp(this ClaimsPrincipal user) =>
        user.FindFirst(ApiConstants.ClaimFtp)?.Value == "true";
}

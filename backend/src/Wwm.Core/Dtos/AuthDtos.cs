namespace Wwm.Core.Dtos;

/// <summary>SPA posts the Discord authorization <c>code</c> (Authorization Code
/// flow); the server exchanges it for a token using its client secret.</summary>
public record DiscordExchangeRequest(string Code, string RedirectUri);

/// <summary>Session the SPA renders. Role/permissions come from the app-managed
/// Member row, never the client. Mirrors the frontend <c>DiscordUserSession</c>.</summary>
public record DiscordUserSession(
    string Username, string AvatarUrl, bool IsAuthorized,
    string Role, bool CanLogin, bool Fp, bool Ftp);

public record AuthResponse(string Token, DiscordUserSession Session);

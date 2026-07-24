namespace Wwm.Api;

public static class ApiConstants
{
    public const string JwtIssuer = "wwm-api";
    public const string JwtAudience = "wwm-spa";

    // Claim names (kept verbatim; MapInboundClaims is disabled so these survive).
    public const string ClaimRole = "role";
    public const string ClaimFp = "fp";
    public const string ClaimFtp = "ftp";

    // Authorization policies.
    public const string PolicyMember = "member";
    public const string PolicyFp = "fp";
    public const string PolicyFtp = "ftp";
    public const string PolicyCommander = "commander";
    public const string PolicyAdmin = "admin";
}

/// <summary>Feature-flag keys — one per toggleable route (PLAN §9A seed).</summary>
public static class FeatureKeys
{
    public const string PageFormation = "page.formation";
    public const string PageFootages = "page.footages";
    public const string PageSchedule = "page.schedule";
    public const string PageMatchHistory = "page.match-history";
    public const string PageEvents = "page.events";
    public const string PageRosterStats = "page.roster-stats";
    public const string FeatureLogin = "feature.login";
    public const string FeatureRegister = "feature.register";

    public static readonly (string Key, string Label)[] Seed =
    [
        (PageFormation, "Formation page"),
        (PageFootages, "Footages page"),
        (PageSchedule, "Schedule page"),
        (PageMatchHistory, "Match History page"),
        (PageEvents, "Events page"),
        (PageRosterStats, "Roster Stats page"),
        (FeatureLogin, "Login"),
        (FeatureRegister, "Register"),
    ];
}

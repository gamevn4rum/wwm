namespace Wwm.Core.Dtos;

// Wire shapes mirroring the Angular models (PLAN §5). A global camelCase naming
// policy maps these PascalCase members to the exact JSON keys the frontend reads.

/// <summary>Safe roster projection for the public homepage member grid — no
/// Discord handle, no permission flags.</summary>
public record PublicMemberDto(string Ign, string Role, string Notes);

/// <summary>Member-gated roster view (any authenticated member).</summary>
public record MemberDto(
    int Id, string Ign, string? Discord, string? Role,
    string? MainWeapon, string? SecondaryWeapon, string? Team,
    string? Saturday, string? Sunday, string? Notes);

/// <summary>Editable permission/role view for Commanders/Admins.</summary>
public record CommanderMemberDto(
    int Id, string Ign, string? Discord, string? Role,
    bool CanLogin, bool Fp, bool Ftp);

public record MemberPatchDto(bool? CanLogin, bool? Fp, bool? Ftp, string? Role);

public record EventRecordDto(
    string Title, string Date, string Description,
    string? Banner, string? P1, string? P2, string? P3, string? P4, string? P5, string? Link);

public record ScheduleRecordDto(string DateTime, string Type, string Activity);

public record FootageEntryDto(string Uploader, string VideoId);

public record MatchRecordDto(
    string Date, string Opponent, string Type, string Status, string Season,
    IReadOnlyList<FootageEntryDto> Footages);

public record FootageRecordDto(
    string Date, string MatchType, string Opponent, string Uploader, string VideoId, string Season);

public record ConfigDto(IReadOnlyDictionary<string, bool> Features);

public record FeatureFlagDto(string Key, bool Enabled, string? Label);

public record FeaturePatchDto(bool Enabled);

public record AuditLogDto(
    int Id, string ActorName, string Action, string TargetType, string TargetId, DateTime Utc);

// ── Registration (request → review → grant) ─────────────────────────────────
public record RegistrationRequest(
    string Discord, string? Uid, string Ign,
    string? MainWeapon, string? SecondaryWeapon, string? Saturday, string? Sunday, string? Note);

public record RegistrationDto(
    int Id, string Discord, string? Uid, string Ign,
    string? MainWeapon, string? SecondaryWeapon, string? Saturday, string? Sunday, string? Note,
    string Status, DateTime SubmittedUtc,
    string? ReviewedBy, DateTime? ReviewedUtc, string? ReviewNote, int? MemberId);

/// <summary>Access flags granted on approval. Role defaults to Warrior.</summary>
public record RegistrationApprove(bool? CanLogin, bool? Fp, bool? Ftp, string? Role);

public record RegistrationReject(string? Note);

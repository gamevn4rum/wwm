using Wwm.Core.Dtos;
using Wwm.Core.Util;
using Wwm.Data.Entities;
using static Wwm.Core.Sheets.SheetNormalization;

namespace Wwm.Core.Mapping;

/// <summary>Entity → wire DTO. The normalized Match/Footage tables are flattened
/// back so MatchRecord / FootageEntry / FootageRecord stay byte-compatible with
/// today's frontend (PLAN §5).</summary>
public static class DtoMappers
{
    public static PublicMemberDto ToPublicMember(Member m) =>
        new(m.Ign, m.Role ?? Roles.Warrior, m.Notes ?? string.Empty);

    public static MemberDto ToMemberDto(Member m) =>
        new(m.Id, m.Ign, m.Discord, Roles.Normalize(m.Role),
            m.MainWeapon, m.SecondaryWeapon, m.Team, m.Saturday, m.Sunday, m.Notes);

    public static CommanderMemberDto ToCommanderMember(Member m) =>
        new(m.Id, m.Ign, m.Discord, Roles.Normalize(m.Role),
            m.CanLogin, m.FormationPermission, m.FootagePermission);

    public static EventRecordDto ToEventDto(Event e) =>
        new(e.Title, FormatDate(e.EventDate), e.Description ?? string.Empty,
            e.Banner, e.P1, e.P2, e.P3, e.P4, e.P5, e.Link);

    public static ScheduleRecordDto ToScheduleDto(ScheduleItem s) =>
        new(s.DateTime ?? string.Empty, s.Type ?? string.Empty, s.Activity);

    /// <param name="includeFootages">Only true when the caller has ftp.</param>
    public static MatchRecordDto ToMatchDto(Match m, bool includeFootages)
    {
        var footages = includeFootages
            ? m.Footages
                .Select(f => new FootageEntryDto(f.Uploader, YoutubeId.Extract(f.YoutubeLink)))
                .Where(f => f.VideoId.Length > 0)
                .ToList()
            : (IReadOnlyList<FootageEntryDto>)[];

        return new MatchRecordDto(
            Date: IsoDate(m.DateTime),
            Opponent: m.OppGuild?.Name ?? string.Empty,
            Type: m.Type ?? string.Empty,
            Status: m.Status ?? string.Empty,
            Season: m.Season?.Name ?? string.Empty,
            Footages: footages);
    }

    /// <summary>Flatten a match's footages into the footages-page shape.</summary>
    public static IEnumerable<FootageRecordDto> ToFootageRecords(Match m) =>
        m.Footages
            .Select(f => new
            {
                f.Uploader,
                VideoId = YoutubeId.Extract(f.YoutubeLink),
            })
            .Where(x => x.VideoId.Length > 0)
            .Select(x => new FootageRecordDto(
                Date: IsoDate(m.DateTime),
                MatchType: CapitalizeType(m.Type),
                Opponent: m.OppGuild?.Name ?? string.Empty,
                Uploader: x.Uploader,
                VideoId: x.VideoId,
                Season: m.Season?.Name ?? string.Empty));

    public static FeatureFlagDto ToFeatureFlagDto(FeatureFlag f) => new(f.Key, f.Enabled, f.Label);

    public static AuditLogDto ToAuditDto(AuditLog a) =>
        new(a.Id, a.ActorName, a.Action, a.TargetType, a.TargetId, a.Utc);

    public static RegistrationDto ToRegistrationDto(Registration r) =>
        new(r.Id, r.Discord, r.Uid, r.Ign, r.MainWeapon, r.SecondaryWeapon, r.Saturday, r.Sunday,
            r.Note, r.Status, r.SubmittedUtc, r.ReviewedBy, r.ReviewedUtc, r.ReviewNote, r.MemberId);

    /// <summary>Match/footage dates use ISO yyyy-MM-dd (parity with the frontend's
    /// parseDate output), unlike events which keep the dd/MMM/yyyy sheet string.</summary>
    private static string IsoDate(DateTime? d) =>
        d?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;

    /// <summary>'league' → 'League' (footages model uses capitalized MatchType).</summary>
    private static string CapitalizeType(string? type) =>
        string.IsNullOrEmpty(type) ? string.Empty : char.ToUpperInvariant(type[0]) + type[1..];
}

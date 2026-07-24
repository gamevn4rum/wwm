using Wwm.Core.Sheets;
using Wwm.Data.Entities;
using static Wwm.Core.Sheets.SheetNormalization;

namespace Wwm.Core.Mapping;

/// <summary>Uploader columns on the Match History tab (from
/// match-record.model.ts <c>UPLOADERS</c>). Each cell is a YouTube URL.</summary>
public static class Uploaders
{
    public static readonly string[] All =
    [
        "Kam", "Necro", "Ruby", "VK", "Yuenshin", "canoc", "Sniper", "LVH", "choxu",
        "MADAFAKA", "MinhVũ", "Initiate",
    ];
}

public static class MemberMapper
{
    /// <summary>Maps a Members-tab row to a fully-populated entity. The [A] fields
    /// (Role/permissions/CanLogin) are the *bootstrap* values; the sync only
    /// applies them on INSERT (PLAN §9). Returns null for a blank-IGN row.</summary>
    public static Member? FromRow(SheetRow row)
    {
        var ign = row.Val("IGN");
        if (ign.Length == 0) return null;

        var discord = row.ValOrNull("Discord");
        var sheetRole = row.Val("Role");

        return new Member
        {
            // [S] sheet-owned
            Ign = ign,
            Discord = discord,
            MainWeapon = row.ValOrNull("Main Weapon"),
            SecondaryWeapon = row.ValOrNull("Secondary Weapon"),
            Team = row.ValOrNull("Team"),
            Saturday = row.ValOrNull("Saturday"),
            Sunday = row.ValOrNull("Sunday"),
            Notes = row.ValOrNull("Notes"),
            // [A] app-owned bootstrap
            Role = BootstrapRole(discord, sheetRole),
            FormationPermission = IsCheck(row.Val("Formation Permission")),
            FootagePermission = IsCheck(row.Val("Footage Permission")),
            CanLogin = true,
        };
    }

    /// <summary>Bootstrap role from the sheet (PLAN §9A seed rules).</summary>
    public static string BootstrapRole(string? discord, string? sheetRole)
    {
        if (string.Equals(discord, "shinigamae", StringComparison.OrdinalIgnoreCase))
            return Roles.Admin;
        if (sheetRole is not null && sheetRole.Contains("Caller", StringComparison.OrdinalIgnoreCase))
            return Roles.Commander;
        return Roles.Warrior;
    }

    /// <summary>Canonical string over the [S] sheet-owned columns only, so the
    /// Members change-detection hash ignores app-owned edits (PLAN §9).</summary>
    public static string SheetOwnedSignature(SheetRow row) => string.Join('',
        row.Val("IGN"), row.Val("Discord"), row.Val("Main Weapon"), row.Val("Secondary Weapon"),
        row.Val("Team"), row.Val("Saturday"), row.Val("Sunday"), row.Val("Notes"));
}

public static class EventMapper
{
    public static Event? FromRow(SheetRow row)
    {
        var title = row.Val("Title");
        if (title.Length == 0) return null;

        return new Event
        {
            Pin = ParsePin(row.Val("Pin")),
            EventDate = ParseDate(row.Val("Date")),
            Title = title,
            Description = row.ValOrNull("Description"),
            Banner = row.ValOrNull("Banner"),
            P1 = row.ValOrNull("P1"),
            P2 = row.ValOrNull("P2"),
            P3 = row.ValOrNull("P3"),
            P4 = row.ValOrNull("P4"),
            P5 = row.ValOrNull("P5"),
            Link = row.ValOrNull("Link"),
        };
    }

    private static bool? ParsePin(string cell) => cell.Length == 0
        ? null
        : cell is "✅" or "TRUE" or "true" or "1" or "yes" or "YES";
}

public static class ScheduleMapper
{
    public static ScheduleItem? FromRow(SheetRow row)
    {
        var activity = row.Val("Activity");
        if (activity.Length == 0) return null;

        return new ScheduleItem
        {
            DateTime = row.ValOrNull("DateTime"),
            Type = row.ValOrNull("Type"),
            Activity = activity,
        };
    }
}

/// <summary>A Match History row parsed into transport-neutral pieces. The sync
/// resolves Opponent→Guild and Season→Season ids before persisting.</summary>
public sealed record ParsedMatch(
    string Opponent,
    DateTime? Date,
    string? Type,
    string? Status,
    string? Season,
    IReadOnlyList<ParsedFootage> Footages);

public sealed record ParsedFootage(string Uploader, string YoutubeLink);

public static class MatchMapper
{
    /// <summary>Parse a Match History row. Returns null when the opponent is
    /// blank (the required natural-key component — PLAN §9).</summary>
    public static ParsedMatch? FromRow(SheetRow row)
    {
        var opponent = row.Val("Opponent");
        if (opponent.Length == 0) return null;

        var footages = new List<ParsedFootage>();
        foreach (var uploader in Uploaders.All)
        {
            var link = row.Val(uploader);
            if (link.Length > 0) footages.Add(new ParsedFootage(uploader, link));
        }

        var date = ParseDate(row.Val("Date"));
        return new ParsedMatch(
            Opponent: opponent,
            Date: date is { } d ? d.ToDateTime(TimeOnly.MinValue) : null,
            Type: row.ValOrNull("Type")?.ToLowerInvariant(),
            Status: row.ValOrNull("Win"),
            Season: row.ValOrNull("Season"),
            Footages: footages);
    }
}

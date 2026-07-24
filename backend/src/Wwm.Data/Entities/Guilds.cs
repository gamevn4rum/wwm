namespace Wwm.Data.Entities;

/// <summary>Opponent guild (opponents were a free-text column in the sheet).</summary>
public class Guild
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;   // opponent name as it appears in the sheet
    public string? Tag { get; set; }
    public string? Region { get; set; }
    public string? NeteaseGuildId { get; set; }        // reserved for the official id (see GUILD-API.md)
    public string? Notes { get; set; }

    public ICollection<Match> Matches { get; set; } = new List<Match>();
    public ICollection<GuildAlias> Aliases { get; set; } = new List<GuildAlias>();
}

/// <summary>Folds opponent-name spelling variants onto one <see cref="Guild"/>.</summary>
public class GuildAlias
{
    public string Alias { get; set; } = string.Empty;  // PK
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }
}

public class Season
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }

    public ICollection<Match> Matches { get; set; } = new List<Match>();
}

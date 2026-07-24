namespace Wwm.Data.Entities;

public class Match
{
    public int Id { get; set; }
    public int OppGuildId { get; set; }                // opponent (was free-text `Opponent`)
    public Guild? OppGuild { get; set; }
    public DateTime? DateTime { get; set; }            // sheet gives a date; time may be 00:00
    public string? Type { get; set; }                  // league | ranked | scrim
    public string? Status { get; set; }                // ✅ | ❌ | ➕ (result, our perspective)
    public int? SeasonId { get; set; }
    public Season? Season { get; set; }

    public ICollection<Footage> Footages { get; set; } = new List<Footage>();
}

/// <summary>A single footage upload for a match. Stores the full URL; the API
/// derives the YouTube videoId for the DTO.</summary>
public class Footage
{
    public int Id { get; set; }
    public int MatchId { get; set; }
    public Match? Match { get; set; }
    public string Uploader { get; set; } = string.Empty;
    public string YoutubeLink { get; set; } = string.Empty;   // full URL
}

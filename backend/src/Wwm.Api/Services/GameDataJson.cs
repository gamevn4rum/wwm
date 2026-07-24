using System.Text.Json.Nodes;
using Wwm.Data.Entities;

namespace Wwm.Api.Services;

/// <summary>
/// Builds the game-data feeds straight from stored JSON, avoiding a
/// deserialize/reserialize round-trip so the wire bytes stay identical to what
/// the sync produced (PLAN §5). PlayerStat is emitted as the frontend's
/// discriminated union (matched true/false).
/// </summary>
public static class GameDataJson
{
    public static string BuildPlayerStats(IEnumerable<PlayerStat> stats)
    {
        var arr = new JsonArray();
        foreach (var s in stats)
        {
            if (s.Matched && s.Detail is not null)
            {
                arr.Add(new JsonObject
                {
                    ["ign"] = s.Ign,
                    ["matched"] = true,
                    ["player"] = JsonNode.Parse(s.Detail),
                });
            }
            else
            {
                var obj = new JsonObject
                {
                    ["ign"] = s.Ign,
                    ["matched"] = false,
                    ["reason"] = s.Reason,
                };
                if (s.FoundName is not null) obj["foundName"] = s.FoundName;
                if (s.FoundRegion is not null) obj["foundRegion"] = s.FoundRegion;
                arr.Add(obj);
            }
        }
        return arr.ToJsonString();
    }

    /// <summary>Wrap the stored catalogue entry blobs into a JSON array.</summary>
    public static string BuildCatalogue(IEnumerable<string> entryJson) =>
        "[" + string.Join(",", entryJson) + "]";
}

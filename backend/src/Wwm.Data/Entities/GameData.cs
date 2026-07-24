namespace Wwm.Data.Entities;

/// <summary>Per-member in-game stats. The nested detail is stored whole as JSON —
/// the client consumes it as a blob and never filters on inner fields.</summary>
public class PlayerStat
{
    public int Id { get; set; }
    public string Ign { get; set; } = string.Empty;   // maps to Member.Ign
    public bool Matched { get; set; }
    public string? Reason { get; set; }               // not_found | name_mismatch | region_mismatch | no_detail | error
    public string? Detail { get; set; }               // PlayerDetail JSON (null when unmatched)
    public string? FoundName { get; set; }            // diagnostics for name_mismatch
    public string? FoundRegion { get; set; }          // diagnostics for region_mismatch
}

/// <summary>Shared shape of the JSON-blob catalogues, so the sync can replace
/// either one generically.</summary>
public interface ICatalogueEntity
{
    int Id { get; set; }
    string? Name { get; set; }
    string Data { get; set; }
}

/// <summary>Static Inner Way catalogue entry. Id is the upstream id (not identity).</summary>
public class InnerWayCatalogue : ICatalogueEntity
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string Data { get; set; } = string.Empty;  // full InnerWayCatalogueEntry JSON
}

/// <summary>Static gear-set catalogue entry. Id is the upstream id (not identity).</summary>
public class SetCatalogue : ICatalogueEntity
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string Data { get; set; } = string.Empty;  // full SetCatalogueEntry JSON
}

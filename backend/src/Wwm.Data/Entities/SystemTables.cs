namespace Wwm.Data.Entities;

/// <summary>DB-side record of the last applied sync state (the change-detection
/// hash itself also lives in Function Storage — see PLAN §6).</summary>
public class SyncState
{
    public string Source { get; set; } = string.Empty;   // 'members' | 'matches' | 'events' | ...
    public DateTime LastRunUtc { get; set; }
    public string LastHash { get; set; } = string.Empty;
}

/// <summary>Toggleable page/feature flag (app-owned, never synced).</summary>
public class FeatureFlag
{
    public string Key { get; set; } = string.Empty;      // 'page.formation' | 'feature.login' | ...
    public bool Enabled { get; set; } = true;
    public string? Label { get; set; }
    public string? UpdatedBy { get; set; }
    public DateTime? UpdatedUtc { get; set; }
}

/// <summary>Immutable audit trail of permission/role/flag changes.</summary>
public class AuditLog
{
    public int Id { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;   // 'member.permission.update' | 'feature.toggle' | ...
    public string TargetType { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public DateTime Utc { get; set; }
}

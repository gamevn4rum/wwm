namespace Wwm.Data.Entities;

/// <summary>
/// Guild member. Column ownership is split (see PLAN §5):
///   [S] sheet-owned — the sync overwrites these on every run.
///   [A] app-owned   — the sync sets these only on INSERT (bootstrap); Commander/
///                     Admin edits are authoritative thereafter and never clobbered.
/// </summary>
public class Member
{
    public int Id { get; set; }

    // [S] sheet-owned
    public string Ign { get; set; } = string.Empty;
    public string? Discord { get; set; }
    public string? MainWeapon { get; set; }
    public string? SecondaryWeapon { get; set; }
    public string? Team { get; set; }
    public string? Saturday { get; set; }
    public string? Sunday { get; set; }
    public string? Notes { get; set; }

    // [A] app-owned
    public string? Role { get; set; }                 // Admin | Commander | Warrior
    public bool CanLogin { get; set; } = true;         // gates the whole authenticated session
    public bool FormationPermission { get; set; }      // fp
    public bool FootagePermission { get; set; }        // ftp
    public string? UpdatedBy { get; set; }             // last editor username (audit)
    public DateTime? UpdatedUtc { get; set; }
}

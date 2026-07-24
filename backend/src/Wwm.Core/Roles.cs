namespace Wwm.Core;

/// <summary>
/// Role hierarchy Admin ⊇ Commander ⊇ Warrior (PLAN §8). Admin is the top role
/// the frontend historically called "Creator" — normalized to Admin here.
/// </summary>
public static class Roles
{
    public const string Admin = "Admin";
    public const string Commander = "Commander";
    public const string Warrior = "Warrior";

    public static int Rank(string? role) => role switch
    {
        Admin or "Creator" => 3,
        Commander => 2,
        _ => 1,
    };

    /// <summary>Canonical role name (folds the legacy "Creator" onto Admin).</summary>
    public static string Normalize(string? role) => Rank(role) switch
    {
        3 => Admin,
        2 => Commander,
        _ => Warrior,
    };

    public static bool AtLeast(string? role, string minimum) => Rank(role) >= Rank(minimum);

    public static bool IsValid(string role) => role is Admin or Commander or Warrior;
}

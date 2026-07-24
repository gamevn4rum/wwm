namespace Wwm.Data.Entities;

public static class RegistrationStatus
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
}

/// <summary>
/// A membership request submitted from the public Register form. An officer
/// (Commander+) reviews the inputs and either approves — which creates/updates
/// the linked <see cref="Member"/> with the granted flags — or rejects it.
/// </summary>
public class Registration
{
    public int Id { get; set; }

    // Applicant-supplied form inputs.
    public string Discord { get; set; } = string.Empty;   // login key; officer verifies
    public string? Uid { get; set; }                       // in-game UID
    public string Ign { get; set; } = string.Empty;
    public string? MainWeapon { get; set; }
    public string? SecondaryWeapon { get; set; }
    public string? Saturday { get; set; }
    public string? Sunday { get; set; }
    public string? Note { get; set; }

    // Review lifecycle.
    public string Status { get; set; } = RegistrationStatus.Pending;
    public DateTime SubmittedUtc { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedUtc { get; set; }
    public string? ReviewNote { get; set; }
    public int? MemberId { get; set; }                     // set on approval
}

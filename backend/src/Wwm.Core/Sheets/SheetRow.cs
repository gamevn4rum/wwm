using System.Globalization;
using System.Text.RegularExpressions;

namespace Wwm.Core.Sheets;

/// <summary>
/// One parsed sheet row: header → cell value, keyed case-insensitively to mirror
/// the frontend's <c>findVal</c> tolerance (PLAN §5 provenance).
/// </summary>
public sealed class SheetRow : Dictionary<string, string?>
{
    public SheetRow() : base(StringComparer.OrdinalIgnoreCase) { }

    /// <summary>Trimmed value for <paramref name="key"/>, or "" when missing/empty.</summary>
    public string Val(string key) =>
        TryGetValue(key, out var v) && v is not null ? v.Trim() : string.Empty;

    /// <summary>Trimmed value, or null when missing/empty (for nullable columns).</summary>
    public string? ValOrNull(string key)
    {
        var s = Val(key);
        return s.Length == 0 ? null : s;
    }
}

public static partial class SheetNormalization
{
    private static readonly string[] Months =
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    [GeneratedRegex(@"^(\d{2})/(\d{2})/(\d{2,4})$")]
    private static partial Regex NumericDate();

    /// <summary>
    /// Port of <c>normalizeRowDates</c> (scripts/fetch-data.js): any DD/MM/YYYY or
    /// DD/MM/YY (numeric month) cell becomes DD/MMM/YYYY (named month) so parsing
    /// downstream always sees one consistent format.
    /// </summary>
    public static string? NormalizeDateCell(string? val)
    {
        if (val is null) return null;
        var m = NumericDate().Match(val);
        if (m.Success)
        {
            var mm = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
            if (mm is >= 1 and <= 12)
            {
                var year = m.Groups[3].Value.Length == 2 ? "20" + m.Groups[3].Value : m.Groups[3].Value;
                return $"{m.Groups[1].Value}/{Months[mm - 1]}/{year}";
            }
        }
        return val;
    }

    public static SheetRow NormalizeRow(SheetRow row)
    {
        var result = new SheetRow();
        foreach (var (k, v) in row) result[k] = NormalizeDateCell(v);
        return result;
    }

    /// <summary>Parse a normalized DD/MMM/YYYY date to <see cref="DateOnly"/>.</summary>
    public static DateOnly? ParseDate(string? normalized)
    {
        if (string.IsNullOrWhiteSpace(normalized)) return null;
        return DateOnly.TryParseExact(normalized.Trim(), "dd/MMM/yyyy",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d
            : null;
    }

    /// <summary>Format a stored date back to the DD/MMM/YYYY string the frontend expects.</summary>
    public static string FormatDate(DateOnly? date) =>
        date?.ToString("dd/MMM/yyyy", CultureInfo.InvariantCulture) ?? string.Empty;

    public static string FormatDate(DateTime? date) =>
        date?.ToString("dd/MMM/yyyy", CultureInfo.InvariantCulture) ?? string.Empty;

    /// <summary>Sheet permission cell → bit: the literal green check means "granted".</summary>
    public static bool IsCheck(string? cell) => cell?.Trim() == "✅";
}

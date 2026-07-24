using System.Text.RegularExpressions;

namespace Wwm.Core.Util;

/// <summary>Port of <c>src/app/core/utils/youtube.utils.ts</c> — derives the
/// 11-char video id from a full URL (or accepts a bare id).</summary>
public static partial class YoutubeId
{
    [GeneratedRegex(@"^[a-zA-Z0-9_-]{11}$")]
    private static partial Regex BareId();

    private static readonly Regex[] Patterns =
    [
        new(@"[?&]v=([a-zA-Z0-9_-]{11})"),
        new(@"youtu\.be/([a-zA-Z0-9_-]{11})"),
        new(@"embed/([a-zA-Z0-9_-]{11})"),
        new(@"shorts/([a-zA-Z0-9_-]{11})"),
        new(@"live/([a-zA-Z0-9_-]{11})"),
    ];

    public static string Extract(string? raw)
    {
        var s = raw?.Trim() ?? string.Empty;
        if (s.Length == 0) return string.Empty;
        if (BareId().IsMatch(s)) return s;
        foreach (var p in Patterns)
        {
            var m = p.Match(s);
            if (m.Success) return m.Groups[1].Value;
        }
        return string.Empty;
    }
}

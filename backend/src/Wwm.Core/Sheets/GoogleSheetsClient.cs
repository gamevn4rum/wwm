using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Wwm.Core.Util;

namespace Wwm.Core.Sheets;

public sealed record SheetsOptions(string ServiceAccountJson, string SheetId);

/// <summary>
/// Port of scripts/fetch-data.js: mints a short-lived OAuth token from a Google
/// service account (JWT-bearer grant, RS256) and reads sheet ranges. The sheet
/// stays private, shared with the SA as Viewer. Transient failures (429/5xx,
/// socket) are retried with exponential backoff; permanent errors throw.
/// </summary>
public sealed class GoogleSheetsClient(HttpClient http, SheetsOptions options)
{
    private const string BaseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    private const int RetryAttempts = 3;

    private string? _accessToken;

    public async Task<string> GetAccessTokenAsync(CancellationToken ct = default)
    {
        if (_accessToken is not null) return _accessToken;

        using var doc = JsonDocument.Parse(options.ServiceAccountJson);
        var root = doc.RootElement;
        var clientEmail = root.GetProperty("client_email").GetString()
            ?? throw new InvalidOperationException("Service account JSON missing client_email.");
        var privateKey = root.GetProperty("private_key").GetString()
            ?? throw new InvalidOperationException("Service account JSON missing private_key.");

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var header = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new { alg = "RS256", typ = "JWT" }));
        var claims = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new
        {
            iss = clientEmail,
            scope = "https://www.googleapis.com/auth/spreadsheets.readonly",
            aud = "https://oauth2.googleapis.com/token",
            iat = now,
            exp = now + 3600,
        }));
        var signingInput = $"{header}.{claims}";

        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKey);
        var signature = rsa.SignData(Encoding.UTF8.GetBytes(signingInput),
            HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var assertion = $"{signingInput}.{Base64Url(signature)}";

        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
            ["assertion"] = assertion,
        });

        var json = await WithRetry(async () =>
        {
            var res = await http.PostAsync("https://oauth2.googleapis.com/token", form, ct);
            return await ReadJsonOrThrow(res, "OAuth token", ct);
        }, "OAuth token", ct);

        _accessToken = json.RootElement.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("Token endpoint returned no access_token.");
        json.Dispose();
        return _accessToken;
    }

    /// <summary>Fetch a range as parsed, date-normalized rows (header row → keys).</summary>
    public async Task<List<SheetRow>> FetchRangeAsync(string range, CancellationToken ct = default)
    {
        var token = await GetAccessTokenAsync(ct);
        var url = $"{BaseUrl}/{options.SheetId}/values/{Uri.EscapeDataString(range)}";

        using var json = await WithRetry(async () =>
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Add("Authorization", $"Bearer {token}");
            var res = await http.SendAsync(req, ct);
            return await ReadJsonOrThrow(res, range, ct);
        }, range, ct);

        return ParseRows(json.RootElement);
    }

    private static List<SheetRow> ParseRows(JsonElement root)
    {
        var rows = new List<SheetRow>();
        if (!root.TryGetProperty("values", out var values) || values.GetArrayLength() < 2)
            return rows;

        var header = values[0].EnumerateArray().Select(c => CellToString(c) ?? string.Empty).ToArray();
        foreach (var row in values.EnumerateArray().Skip(1))
        {
            var cells = row.EnumerateArray().ToArray();
            var dict = new SheetRow();
            for (var i = 0; i < header.Length; i++)
            {
                var raw = i < cells.Length ? CellToString(cells[i]) : null;
                dict[header[i]] = SheetNormalization.NormalizeDateCell(raw);
            }
            rows.Add(dict);
        }
        return rows;
    }

    private static string? CellToString(JsonElement cell) => cell.ValueKind switch
    {
        JsonValueKind.String => cell.GetString(),
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        _ => cell.ToString(),
    };

    private static async Task<JsonDocument> ReadJsonOrThrow(HttpResponseMessage res, string label, CancellationToken ct)
    {
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            var retriable = res.StatusCode == HttpStatusCode.TooManyRequests || (int)res.StatusCode >= 500;
            throw new SheetsException($"HTTP {(int)res.StatusCode} for {label}: {Truncate(body)}", retriable);
        }
        return JsonDocument.Parse(body);
    }

    private static async Task<T> WithRetry<T>(Func<Task<T>> fn, string label, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try { return await fn(); }
            catch (Exception ex) when (attempt < RetryAttempts && IsRetriable(ex))
            {
                await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt - 1)), ct);
            }
        }
    }

    private static bool IsRetriable(Exception ex) => ex switch
    {
        SheetsException s => s.Retriable,
        HttpRequestException or TaskCanceledException => true,
        _ => false,
    };

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string Truncate(string s) => s.Length <= 200 ? s : s[..200];
}

public sealed class SheetsException(string message, bool retriable) : Exception(message)
{
    public bool Retriable { get; } = retriable;
}

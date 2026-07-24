using System.Net;
using System.Text;
using System.Text.Json.Nodes;

namespace Wwm.Core.Wwmdb;

public sealed record WwmdbOptions(string Token, IReadOnlyList<string> AllowedRegions);

/// <summary>Shaped player stats for one IGN (mirrors PlayerStatsRecord union).</summary>
public sealed record PlayerStatResult(
    string Ign, bool Matched, string? Reason, string? FoundName, string? FoundRegion, string? DetailJson);

/// <summary>One shaped catalogue entry (inner-way or set).</summary>
public sealed record CatalogueEntry(int Id, string? Name, string DataJson);

/// <summary>The full id list plus the entries actually fetched this run, so the
/// caller can keep last-good rows for ids that failed (parity with the JS).</summary>
public sealed record CatalogueResult(IReadOnlyList<int> AllIds, IReadOnlyList<CatalogueEntry> Fetched);

/// <summary>
/// Port of scripts/fetch-player-stats.js: rides wwmdb's relay of NetEase's API.
/// bearer = base64(repeating-key-XOR(`{token}:{unixSeconds}`, nonce)), same nonce
/// as X-Request-Id. Applies a strict field allow-list — the upstream account
/// email is NEVER copied out (PLAN §9, PRIVACY note).
/// </summary>
public sealed class WwmdbClient(HttpClient http, WwmdbOptions options)
{
    private const string ApiBase = "https://wwmdb.vlt.fyi/api/wwm.v1.WwmService";
    private const int RetryAttempts = 3;
    private const int MemberDelayMs = 400;
    private const int CatalogueItemDelayMs = 250;

    // ── Per-member lookup ────────────────────────────────────────────────
    public async Task<PlayerStatResult> FetchPlayerAsync(string ign, CancellationToken ct = default)
    {
        JsonNode? search;
        try
        {
            search = await CallAsync("SearchUser", new JsonObject { ["search"] = ign }, ct);
        }
        catch (WwmdbException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return new PlayerStatResult(ign, false, "not_found", null, null, null);
        }

        var user = search?["user"];
        if (user?["id"] is null)
            return new PlayerStatResult(ign, false, "not_found", null, null, null);

        var foundName = Str(user["name"]) ?? string.Empty;
        if (!string.Equals(foundName.Trim(), ign, StringComparison.OrdinalIgnoreCase))
            return new PlayerStatResult(ign, false, "name_mismatch", foundName, null, null);

        var overseaTag = Str(user["overseaTag"]);
        if (options.AllowedRegions.Count > 0 && !string.IsNullOrEmpty(overseaTag)
            && !options.AllowedRegions.Contains(overseaTag))
            return new PlayerStatResult(ign, false, "region_mismatch", null, overseaTag, null);

        var detail = await CallAsync("Player", new JsonObject
        {
            ["id"] = user["id"]?.DeepClone(),
            ["hostnum"] = user["hostnum"]?.DeepClone(),
        }, ct);

        var player = detail?["player"];
        if (player is null)
            return new PlayerStatResult(ign, false, "no_detail", null, null, null);

        return new PlayerStatResult(ign, true, null, null, null, ShapePlayer(player).ToJsonString());
    }

    // ── Catalogues ───────────────────────────────────────────────────────
    public Task<CatalogueResult> FetchInnerWaysAsync(CancellationToken ct = default) =>
        FetchCatalogueAsync("InnerWays", "InnerWay", ShapeInnerWayDetail, ct);

    public Task<CatalogueResult> FetchSuitsAsync(CancellationToken ct = default) =>
        FetchCatalogueAsync("Suits", "Suit", ShapeSuitDetail, ct);

    private async Task<CatalogueResult> FetchCatalogueAsync(
        string listMethod, string detailMethod, Func<JsonNode, JsonObject> shape, CancellationToken ct)
    {
        var list = await CallAsync(listMethod, new JsonObject(), ct);
        var ids = (list?["items"] as JsonArray ?? [])
            .Select(it => (int?)(it?["id"]))
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .ToList();

        var fetched = new List<CatalogueEntry>();
        foreach (var id in ids)
        {
            try
            {
                var detail = await CallAsync(detailMethod, new JsonObject { ["id"] = id }, ct);
                var item = detail?["item"] ?? throw new WwmdbException("empty item", null, false);
                fetched.Add(new CatalogueEntry(id, Str(item["name"]), shape(item).ToJsonString()));
            }
            catch (Exception)
            {
                // Per-id failure: caller keeps the last-good DB row for this id.
            }
            await Task.Delay(CatalogueItemDelayMs, ct);
        }
        return new CatalogueResult(ids, fetched);
    }

    public int MemberDelayMilliseconds => MemberDelayMs;

    // ── Transport ────────────────────────────────────────────────────────
    private async Task<JsonNode?> CallAsync(string method, JsonNode body, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/{method}")
                {
                    Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
                };
                AddAuthHeaders(req, method);
                using var res = await http.SendAsync(req, ct);
                var text = await res.Content.ReadAsStringAsync(ct);
                if (!res.IsSuccessStatusCode)
                {
                    var retriable = res.StatusCode == HttpStatusCode.TooManyRequests || (int)res.StatusCode >= 500;
                    throw new WwmdbException($"HTTP {(int)res.StatusCode} for {method}", res.StatusCode, retriable);
                }
                return JsonNode.Parse(text);
            }
            catch (Exception ex) when (attempt < RetryAttempts && IsRetriable(ex))
            {
                await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt - 1)), ct);
            }
        }
    }

    private void AddAuthHeaders(HttpRequestMessage req, string _)
    {
        var nonce = Guid.NewGuid().ToString();
        var payload = $"{options.Token}:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
        var bearer = Convert.ToBase64String(Xor(payload, nonce));
        req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {bearer}");
        req.Headers.TryAddWithoutValidation("X-Request-Id", nonce);
        req.Headers.TryAddWithoutValidation("X-Language", "en");
    }

    private static byte[] Xor(string str, string key)
    {
        var s = Encoding.UTF8.GetBytes(str);
        var k = Encoding.UTF8.GetBytes(key);
        var o = new byte[s.Length];
        for (var i = 0; i < s.Length; i++) o[i] = (byte)(s[i] ^ k[i % k.Length]);
        return o;
    }

    private static bool IsRetriable(Exception ex) => ex switch
    {
        WwmdbException w => w.Retriable,
        HttpRequestException or TaskCanceledException => true,
        _ => false,
    };

    // ── Shaping (strict PII allow-list; never copy account/email) ─────────
    private static JsonObject ShapePlayer(JsonNode player)
    {
        var gear = new JsonArray();
        if (player["gearSlots"] is JsonObject slots)
        {
            foreach (var (key, slot) in slots)
            {
                if (slot is JsonObject)
                {
                    var shaped = ShapeGearSlot(slot);
                    var withSlot = new JsonObject { ["slot"] = key };
                    foreach (var (k, v) in shaped) withSlot[k] = v?.DeepClone();
                    gear.Add(withSlot);
                }
            }
        }

        var innerWays = new JsonArray();
        if (player["innerWays"] is JsonArray iws)
            foreach (var iw in iws)
                if (iw is not null)
                    innerWays.Add(new JsonObject
                    {
                        ["id"] = Clone(iw["id"]),
                        ["name"] = Str(iw["name"]) ?? "",
                        ["tier"] = Clone(iw["tier"]),
                    });

        return new JsonObject
        {
            ["name"] = Str(player["name"]) ?? "",
            ["numberId"] = Clone(player["numberId"]),   // public in-game id, not the email
            ["level"] = Clone(player["level"]),
            ["weaponMasteryMax"] = Clone(player["weaponMasteryMax"]),
            ["school"] = StrIfString(player["school"]),
            ["region"] = Clone(player["tag"]),
            ["server"] = Clone(player["hostNum"]),
            ["hostTag"] = Clone(player["hostTag"]),
            ["gender"] = Clone(player["gender"]),
            ["language"] = Clone(player["language"]),
            ["createTime"] = Clone(player["createTime"]),
            ["gear"] = gear,
            ["innerWays"] = innerWays,
        };
    }

    private static JsonObject ShapeGearSlot(JsonNode slot) => new()
    {
        ["equipItemId"] = Clone(slot["equipItemId"]),
        ["name"] = Str(slot["name"]) ?? "",
        ["slotName"] = Str(slot["slotName"]) ?? "",
        ["tier"] = Clone(slot["tier"]),
        ["level"] = Clone(slot["level"]),
        ["set"] = slot["set"] is JsonNode set
            ? new JsonObject { ["id"] = Clone(set["id"]), ["name"] = Str(set["name"]) ?? "" }
            : null,
        ["attributes"] = MapArray(slot["attributes"], a => new JsonObject
        {
            ["name"] = Str(a["name"]) ?? "",
            ["value"] = Clone(a["value"]),
        }),
        ["affixes"] = MapArray(slot["affixes"], a => new JsonObject
        {
            ["name"] = Str(a["name"]) ?? "",
            ["value"] = Clone(a["value"]),
            ["tier"] = Clone(a["tier"]),
        }),
    };

    private static JsonObject ShapeInnerWayDetail(JsonNode item) => new()
    {
        ["id"] = Clone(item["id"]),
        ["name"] = Str(item["name"]) ?? "",
        ["tier"] = Clone(item["tier"]),
        ["path"] = item["path"] is JsonNode path
            ? new JsonObject { ["id"] = Clone(path["id"]), ["name"] = Str(path["name"]) ?? "" }
            : null,
        ["weapon"] = item["weapon"] is JsonNode weapon
            ? new JsonObject { ["id"] = Clone(weapon["id"]), ["name"] = Str(weapon["name"]) ?? "" }
            : null,
        ["effectTypes"] = MapArray(item["effectTypes"], e => new JsonObject
        {
            ["id"] = Clone(e["id"]),
            ["name"] = Str(e["name"]) ?? "",
        }),
        ["lore"] = Str(item["desc"]) ?? "",
        ["effect"] = Str(item["passiveSkill"]?["description"]) ?? "",
        ["maxAdvancedLevel"] = Clone(item["maxAdvancedLevel"]),
        ["upranks"] = MapArray(item["upranks"], ShapeUprank),
    };

    private static JsonObject ShapeUprank(JsonNode u)
    {
        var worldLevel = (long?)(u["worldLevel"]);
        return new JsonObject
        {
            ["id"] = Clone(u["id"]),
            ["worldLevel"] = Clone(u["worldLevel"]),
            ["desc"] = Str(u["desc"]) ?? "",
            ["briefDesc"] = Str(u["briefDesc"]) ?? "",
            ["passiveSkill"] = u["passiveSkill"] is JsonNode ps
                ? new JsonObject
                {
                    ["id"] = Clone(ps["id"]),
                    ["name"] = Str(ps["name"]) ?? "",
                    ["description"] = Str(ps["description"]) ?? "",
                }
                : null,
            ["fixedAttributes"] = FixedAttributes(u["fixedAttributes"]),
            ["dynamicAttributes"] = ResolveDynamicAttributes(u["dynamicAttributes"], worldLevel),
        };
    }

    private static JsonArray FixedAttributes(JsonNode? attrs)
    {
        var arr = new JsonArray();
        if (attrs is JsonArray a)
            foreach (var item in a)
            {
                var value = item?["value"];
                if (value?["value"] is not null)
                    arr.Add(new JsonObject
                    {
                        ["name"] = Str(value["name"]) ?? "",
                        ["value"] = Clone(value["value"]),
                    });
            }
        return arr;
    }

    /// <summary>Port of resolveDynamicAttributes — collapse per-worldLevel entries
    /// to one current value per attribute as of <paramref name="atWorldLevel"/>.</summary>
    private static JsonArray ResolveDynamicAttributes(JsonNode? dynamicAttributes, long? atWorldLevel)
    {
        var arr = new JsonArray();
        if (dynamicAttributes is not JsonArray das || atWorldLevel is null) return arr;

        var byName = new Dictionary<string, (long WorldLevel, JsonNode? Value)>();
        foreach (var da in das)
        {
            var name = Str(da?["value"]?["name"]);
            var value = da?["value"]?["value"];
            var wl = (long?)(da?["worldLevel"]);
            if (string.IsNullOrEmpty(name) || value is null || wl is null || wl > atWorldLevel) continue;
            if (!byName.TryGetValue(name, out var prev) || wl >= prev.WorldLevel)
                byName[name] = (wl.Value, value);
        }
        foreach (var (name, v) in byName)
            arr.Add(new JsonObject { ["name"] = name, ["value"] = Clone(v.Value) });
        return arr;
    }

    private static JsonObject ShapeSuitDetail(JsonNode item) => new()
    {
        ["id"] = Clone(item["id"]),
        ["name"] = Str(item["name"]) ?? "",
        ["shortName"] = Str(item["shortName"]) ?? "",
        ["bonuses2"] = MapArray(item["bonuses2"], b => new JsonObject
        {
            ["attrId"] = Clone(b["attrId"]),
            ["attrName"] = Str(b["attrName"]) ?? "",
            ["values"] = MapArray(b["values"], v => new JsonObject
            {
                ["level"] = Clone(v["level"]),
                ["value"] = Clone(v["value"]),
            }),
        }),
        ["bonuses4"] = MapArray(item["bonuses4"], b => new JsonObject
        {
            ["id"] = Clone(b["id"]),
            ["name"] = Str(b["name"]) ?? "",
            ["description"] = Str(b["description"]) ?? "",
        }),
    };

    // ── JsonNode helpers ─────────────────────────────────────────────────
    private static JsonArray MapArray(JsonNode? source, Func<JsonNode, JsonObject> f)
    {
        var arr = new JsonArray();
        if (source is JsonArray a)
            foreach (var item in a)
                if (item is not null) arr.Add(f(item));
        return arr;
    }

    private static JsonNode? Clone(JsonNode? n) => n?.DeepClone();

    private static string? Str(JsonNode? n)
    {
        if (n is null) return null;
        try { return n.GetValue<string>(); }
        catch { return null; }
    }

    private static JsonNode? StrIfString(JsonNode? n)
    {
        var s = Str(n);
        return s is null ? null : JsonValue.Create(s);
    }
}

public sealed class WwmdbException(string message, HttpStatusCode? statusCode, bool retriable) : Exception(message)
{
    public HttpStatusCode? StatusCode { get; } = statusCode;
    public bool Retriable { get; } = retriable;
}

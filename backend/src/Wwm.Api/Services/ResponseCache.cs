using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Wwm.Core.Util;

namespace Wwm.Api.Services;

/// <summary>
/// Serves JSON through an in-process cache so bursts collapse to one DB read
/// (PLAN §6). Public payloads get hard HTTP caching (Cache-Control + ETag/304);
/// member payloads are cached server-side only and marked private/no-store.
/// </summary>
public static class ResponseCache
{
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private sealed record Cached(string Json, string ETag);

    public static Task<IResult> ServePublic<T>(
        HttpContext ctx, IMemoryCache cache, string key, int maxAgeSeconds, Func<Task<T>> factory) =>
        Serve(ctx, cache, key, maxAgeSeconds, isPublic: true,
            async () => JsonSerializer.Serialize(await factory(), Web));

    public static Task<IResult> ServePublicRaw(
        HttpContext ctx, IMemoryCache cache, string key, int maxAgeSeconds, Func<Task<string>> factory) =>
        Serve(ctx, cache, key, maxAgeSeconds, isPublic: true, factory);

    public static Task<IResult> ServeMember<T>(
        HttpContext ctx, IMemoryCache cache, string key, int maxAgeSeconds, Func<Task<T>> factory) =>
        Serve(ctx, cache, key, maxAgeSeconds, isPublic: false,
            async () => JsonSerializer.Serialize(await factory(), Web));

    public static Task<IResult> ServeMemberRaw(
        HttpContext ctx, IMemoryCache cache, string key, int maxAgeSeconds, Func<Task<string>> factory) =>
        Serve(ctx, cache, key, maxAgeSeconds, isPublic: false, factory);

    private static async Task<IResult> Serve(
        HttpContext ctx, IMemoryCache cache, string key, int maxAgeSeconds, bool isPublic,
        Func<Task<string>> jsonFactory)
    {
        var entry = await cache.GetOrCreateAsync(key, async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(Math.Max(maxAgeSeconds, 5));
            var json = await jsonFactory();
            return new Cached(json, $"\"{Hashing.Sha256Hex(json)[..16]}\"");
        }) ?? throw new InvalidOperationException("cache factory returned null");

        var resp = ctx.Response;
        if (isPublic)
        {
            resp.Headers.CacheControl = $"public, max-age={maxAgeSeconds}";
            resp.Headers.ETag = entry.ETag;
            if (ctx.Request.Headers.IfNoneMatch.ToString() == entry.ETag)
                return Results.StatusCode(StatusCodes.Status304NotModified);
        }
        else
        {
            resp.Headers.CacheControl = "private, no-store";
        }
        return Results.Content(entry.Json, "application/json");
    }
}

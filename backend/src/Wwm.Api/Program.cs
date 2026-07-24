using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Wwm.Api;
using Wwm.Api.Auth;
using Wwm.Api.Endpoints;
using Wwm.Api.Services;
using Wwm.Core;
using Wwm.Data;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;
var isDev = builder.Environment.IsDevelopment();

// ── Fail fast on insecure production config ─────────────────────────────
// The dev fallbacks below are in the repo, so they must NEVER run in prod:
// a known signing key = anyone can forge an Admin token.
const string DevSigningKey = "dev-only-insecure-key-change-me-please-32b";
var signingKey = cfg["JWT_SIGNING_KEY"];
if (!isDev && (string.IsNullOrWhiteSpace(signingKey) || signingKey.Length < 32 || signingKey == DevSigningKey))
    throw new InvalidOperationException("JWT_SIGNING_KEY must be a strong (>=32 char) secret in production.");
signingKey ??= DevSigningKey;

var corsRaw = cfg["CORS_ALLOWED_ORIGINS"];
if (!isDev && string.IsNullOrWhiteSpace(corsRaw))
    throw new InvalidOperationException("CORS_ALLOWED_ORIGINS must list the SPA origin(s) in production.");
var origins = (corsRaw ?? "http://localhost:4200")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

// ── Data ────────────────────────────────────────────────────────────────
var conn = cfg["SQL_CONNECTION_STRING"]
    ?? "Server=(localdb)\\MSSQLLocalDB;Database=Wwm;Trusted_Connection=True;TrustServerCertificate=True";
builder.Services.AddDbContext<WwmDbContext>(o => o.UseSqlServer(conn));

builder.Services.AddMemoryCache();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient<DiscordClient>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<FeatureFlagService>();

// ── Auth: validate our own HMAC-signed app JWT ──────────────────────────
builder.Services.AddAuthentication("Bearer").AddJwtBearer("Bearer", options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = ApiConstants.JwtIssuer,
        ValidateAudience = true,
        ValidAudience = ApiConstants.JwtAudience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30),
    };
});

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(ApiConstants.PolicyMember, p => p.RequireAuthenticatedUser())
    .AddPolicy(ApiConstants.PolicyFp, p => p.RequireAssertion(c => c.User.HasFp()))
    .AddPolicy(ApiConstants.PolicyFtp, p => p.RequireAssertion(c => c.User.HasFtp()))
    .AddPolicy(ApiConstants.PolicyCommander, p => p.RequireAssertion(c => Roles.AtLeast(c.User.Role(), Roles.Commander)))
    .AddPolicy(ApiConstants.PolicyAdmin, p => p.RequireAssertion(c => c.User.Role() == Roles.Admin));

// ── CORS: only the configured SPA origin(s) can read responses in a browser.
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(origins)
    .WithHeaders("Authorization", "Content-Type", "If-None-Match")
    .WithMethods("GET", "POST", "PATCH")
    .WithExposedHeaders("ETag")));

// ── Rate limiting: per-client-IP global cap + tighter buckets on auth/register.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
    o.AddFixedWindowLimiter("auth", opt =>
    {
        opt.PermitLimit = 10;
        opt.Window = TimeSpan.FromMinutes(1);
    });
    o.AddFixedWindowLimiter("register", opt =>
    {
        opt.PermitLimit = 5;
        opt.Window = TimeSpan.FromMinutes(1);
    });
});

// Trust the App Service reverse proxy so RemoteIpAddress reflects the real
// client (via X-Forwarded-For) — otherwise every request shares one rate-limit
// bucket and HTTPS redirect can misfire behind TLS termination.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

app.UseForwardedHeaders();
if (!isDev)
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseCors();

// ── Frontend-origin restriction (defense-in-depth; browser-scoped) ──────
// Hard-reject any request whose Origin is a browser origin NOT on the allow
// list, before it reaches an endpoint. Requests with no Origin (server-to-
// server, health checks) pass here and still hit the JWT boundary for gated
// data — a non-browser client cannot be blocked by origin, so auth remains the
// authoritative control. Disable with RESTRICT_TO_FRONTEND=false.
var restrictToFrontend = cfg["RESTRICT_TO_FRONTEND"] != "false";
var allowedOrigins = origins.ToHashSet(StringComparer.OrdinalIgnoreCase);
if (restrictToFrontend)
{
    app.Use(async (ctx, next) =>
    {
        var origin = ctx.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin) && !allowedOrigins.Contains(origin))
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
        await next();
    });
}

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Optional auto-migrate + feature-flag seed (handy for the free App Service tier).
if (cfg["AUTO_MIGRATE"] == "true")
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<WwmDbContext>();
    await db.Database.MigrateAsync();
    await Wwm.Api.Services.Seeder.SeedFeatureFlagsAsync(db);
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapPublicEndpoints();
app.MapAuthEndpoints();
app.MapMemberEndpoints();
app.MapCommanderEndpoints();
app.MapAdminEndpoints();

app.Run();

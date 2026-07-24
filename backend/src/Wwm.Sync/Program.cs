using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Wwm.Core.Sheets;
using Wwm.Core.Wwmdb;
using Wwm.Data;
using Wwm.Sync.ChangeDetection;
using Wwm.Sync.Sync;

// wwmdb's default embedded token (env-overridable — it may rotate; see PLAN §9).
const string DefaultWwmdbToken = "ab964c45612bda768691108730d0c31c9b77116449fc99c3d4dc29d17db2cd77";

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices((ctx, services) =>
    {
        var cfg = ctx.Configuration;

        services.AddDbContext<WwmDbContext>(o =>
            o.UseSqlServer(cfg["SQL_CONNECTION_STRING"]));

        services.AddSingleton(new SheetsOptions(
            cfg["GOOGLE_SERVICE_ACCOUNT_JSON"] ?? string.Empty,
            cfg["GOOGLE_SHEET_ID"] ?? string.Empty));
        services.AddHttpClient<GoogleSheetsClient>();

        var regions = (cfg["WWMDB_ALLOWED_REGIONS"] ?? "SEA")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        services.AddSingleton(new WwmdbOptions(cfg["WWMDB_TOKEN"] ?? DefaultWwmdbToken, regions));
        services.AddHttpClient<WwmdbClient>();

        services.AddSingleton<HashStateStore>();
        services.AddScoped<SyncService>();
    })
    .Build();

host.Run();

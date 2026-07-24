using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Wwm.Data;

/// <summary>
/// Design-time factory so <c>dotnet ef</c> can build the model from this class
/// library without a running host. Uses <c>SQL_CONNECTION_STRING</c> if present
/// (e.g. for <c>database update</c>); otherwise a placeholder that is only ever
/// parsed, never connected to (enough for <c>migrations add</c>/<c>script</c>).
/// </summary>
public class WwmDbContextFactory : IDesignTimeDbContextFactory<WwmDbContext>
{
    public WwmDbContext CreateDbContext(string[] args)
    {
        var conn = Environment.GetEnvironmentVariable("SQL_CONNECTION_STRING")
                   ?? "Server=(localdb)\\MSSQLLocalDB;Database=Wwm;Trusted_Connection=True;TrustServerCertificate=True";

        var options = new DbContextOptionsBuilder<WwmDbContext>()
            .UseSqlServer(conn)
            .Options;

        return new WwmDbContext(options);
    }
}

using Microsoft.EntityFrameworkCore;
using Wwm.Data.Entities;

namespace Wwm.Data;

public class WwmDbContext(DbContextOptions<WwmDbContext> options) : DbContext(options)
{
    public DbSet<Member> Members => Set<Member>();
    public DbSet<Guild> Guilds => Set<Guild>();
    public DbSet<GuildAlias> GuildAliases => Set<GuildAlias>();
    public DbSet<Season> Seasons => Set<Season>();
    public DbSet<Match> Matches => Set<Match>();
    public DbSet<Footage> Footages => Set<Footage>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<ScheduleItem> ScheduleItems => Set<ScheduleItem>();
    public DbSet<PlayerStat> PlayerStats => Set<PlayerStat>();
    public DbSet<InnerWayCatalogue> InnerWayCatalogues => Set<InnerWayCatalogue>();
    public DbSet<SetCatalogue> SetCatalogues => Set<SetCatalogue>();
    public DbSet<SyncState> SyncStates => Set<SyncState>();
    public DbSet<FeatureFlag> FeatureFlags => Set<FeatureFlag>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Registration> Registrations => Set<Registration>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Member>(e =>
        {
            e.HasIndex(m => m.Ign).IsUnique();
            e.Property(m => m.Ign).HasMaxLength(100).IsRequired();
            e.Property(m => m.Discord).HasMaxLength(100);
            e.Property(m => m.MainWeapon).HasMaxLength(60);
            e.Property(m => m.SecondaryWeapon).HasMaxLength(60);
            e.Property(m => m.Role).HasMaxLength(40);
            e.Property(m => m.Team).HasMaxLength(40);
            e.Property(m => m.Saturday).HasMaxLength(20);
            e.Property(m => m.Sunday).HasMaxLength(20);
            e.Property(m => m.Notes).HasMaxLength(500);
            e.Property(m => m.UpdatedBy).HasMaxLength(100);
            e.Property(m => m.CanLogin).HasDefaultValue(true);
            e.Property(m => m.FormationPermission).HasDefaultValue(false);
            e.Property(m => m.FootagePermission).HasDefaultValue(false);
        });

        b.Entity<Guild>(e =>
        {
            e.HasIndex(g => g.Name).IsUnique();
            e.Property(g => g.Name).HasMaxLength(100).IsRequired();
            e.Property(g => g.Tag).HasMaxLength(20);
            e.Property(g => g.Region).HasMaxLength(20);
            e.Property(g => g.NeteaseGuildId).HasMaxLength(40);
            e.Property(g => g.Notes).HasMaxLength(300);
        });

        b.Entity<GuildAlias>(e =>
        {
            e.HasKey(a => a.Alias);
            e.Property(a => a.Alias).HasMaxLength(100);
            e.HasOne(a => a.Guild).WithMany(g => g.Aliases)
                .HasForeignKey(a => a.GuildId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Season>(e =>
        {
            e.HasIndex(s => s.Name).IsUnique();
            e.Property(s => s.Name).HasMaxLength(40).IsRequired();
        });

        b.Entity<Match>(e =>
        {
            e.Property(m => m.Type).HasMaxLength(20);
            e.Property(m => m.Status).HasMaxLength(4);
            e.HasOne(m => m.OppGuild).WithMany(g => g.Matches)
                .HasForeignKey(m => m.OppGuildId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(m => m.Season).WithMany(s => s.Matches)
                .HasForeignKey(m => m.SeasonId).OnDelete(DeleteBehavior.SetNull);
            // Natural key used by the sync's idempotent upsert (PLAN §9).
            e.HasIndex(m => new { m.OppGuildId, m.DateTime, m.Type }).IsUnique();
        });

        b.Entity<Footage>(e =>
        {
            e.Property(f => f.Uploader).HasMaxLength(40).IsRequired();
            e.Property(f => f.YoutubeLink).HasMaxLength(300).IsRequired();
            e.HasOne(f => f.Match).WithMany(m => m.Footages)
                .HasForeignKey(f => f.MatchId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Event>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Banner).HasMaxLength(500);
            e.Property(x => x.P1).HasMaxLength(500);
            e.Property(x => x.P2).HasMaxLength(500);
            e.Property(x => x.P3).HasMaxLength(500);
            e.Property(x => x.P4).HasMaxLength(500);
            e.Property(x => x.P5).HasMaxLength(500);
            e.Property(x => x.Link).HasMaxLength(500);
        });

        b.Entity<ScheduleItem>(e =>
        {
            e.Property(s => s.DateTime).HasMaxLength(60);
            e.Property(s => s.Type).HasMaxLength(40);
            e.Property(s => s.Activity).HasMaxLength(200).IsRequired();
        });

        b.Entity<PlayerStat>(e =>
        {
            e.HasIndex(p => p.Ign).IsUnique();
            e.Property(p => p.Ign).HasMaxLength(100).IsRequired();
            e.Property(p => p.Reason).HasMaxLength(30);
            e.Property(p => p.FoundName).HasMaxLength(100);
            e.Property(p => p.FoundRegion).HasMaxLength(30);
            e.ToTable(t => t.HasCheckConstraint(
                "CK_PlayerStat_Detail_Json", "[Detail] IS NULL OR ISJSON([Detail]) = 1"));
        });

        b.Entity<InnerWayCatalogue>(e =>
        {
            e.Property(x => x.Id).ValueGeneratedNever();   // upstream id
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Data).IsRequired();
            e.ToTable(t => t.HasCheckConstraint(
                "CK_InnerWayCatalogue_Data_Json", "ISJSON([Data]) = 1"));
        });

        b.Entity<SetCatalogue>(e =>
        {
            e.Property(x => x.Id).ValueGeneratedNever();   // upstream id
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Data).IsRequired();
            e.ToTable(t => t.HasCheckConstraint(
                "CK_SetCatalogue_Data_Json", "ISJSON([Data]) = 1"));
        });

        b.Entity<SyncState>(e =>
        {
            e.HasKey(s => s.Source);
            e.Property(s => s.Source).HasMaxLength(40);
            e.Property(s => s.LastHash).HasMaxLength(64).IsRequired();
        });

        b.Entity<FeatureFlag>(e =>
        {
            e.HasKey(f => f.Key);
            e.Property(f => f.Key).HasMaxLength(60);
            e.Property(f => f.Enabled).HasDefaultValue(true);
            e.Property(f => f.Label).HasMaxLength(120);
            e.Property(f => f.UpdatedBy).HasMaxLength(100);
        });

        b.Entity<AuditLog>(e =>
        {
            e.Property(a => a.ActorName).HasMaxLength(100).IsRequired();
            e.Property(a => a.Action).HasMaxLength(60).IsRequired();
            e.Property(a => a.TargetType).HasMaxLength(40).IsRequired();
            e.Property(a => a.TargetId).HasMaxLength(100).IsRequired();
            e.HasIndex(a => a.Utc);
        });

        b.Entity<Registration>(e =>
        {
            e.Property(r => r.Discord).HasMaxLength(100).IsRequired();
            e.Property(r => r.Uid).HasMaxLength(40);
            e.Property(r => r.Ign).HasMaxLength(100).IsRequired();
            e.Property(r => r.MainWeapon).HasMaxLength(60);
            e.Property(r => r.SecondaryWeapon).HasMaxLength(60);
            e.Property(r => r.Saturday).HasMaxLength(20);
            e.Property(r => r.Sunday).HasMaxLength(20);
            e.Property(r => r.Note).HasMaxLength(500);
            e.Property(r => r.Status).HasMaxLength(10).IsRequired();
            e.Property(r => r.ReviewedBy).HasMaxLength(100);
            e.Property(r => r.ReviewNote).HasMaxLength(500);
            e.HasIndex(r => r.Status);
        });
    }
}

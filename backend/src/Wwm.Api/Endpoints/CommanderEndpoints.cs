using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Wwm.Api.Auth;
using Wwm.Core;
using Wwm.Core.Dtos;
using Wwm.Core.Mapping;
using Wwm.Data;
using Wwm.Data.Entities;

namespace Wwm.Api.Endpoints;

public static class CommanderEndpoints
{
    public static void MapCommanderEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/commander").RequireAuthorization(ApiConstants.PolicyCommander);

        group.MapGet("/members", async (WwmDbContext db, CancellationToken ct) =>
        {
            var members = await db.Members.AsNoTracking().OrderBy(m => m.Ign).ToListAsync(ct);
            return Results.Ok(members.Select(DtoMappers.ToCommanderMember).ToList());
        });

        // Edit app-owned permission/role fields (audited). Role-grant policy (PLAN §8,
        // strict reading of §15): a non-Admin may only edit Warriors and may not set
        // any role above Warrior — so Commanders can never grant/modify Commander/Admin.
        group.MapPatch("/members/{id:int}", async (
            int id, MemberPatchDto patch, HttpContext ctx, WwmDbContext db,
            IMemoryCache cache, CancellationToken ct) =>
        {
            var actor = ctx.User.Username();
            var actorIsAdmin = ctx.User.Role() == Roles.Admin;

            var member = await db.Members.FirstOrDefaultAsync(m => m.Id == id, ct);
            if (member is null) return Results.NotFound();

            if (!actorIsAdmin)
            {
                if (Roles.Rank(member.Role) > Roles.Rank(Roles.Warrior))
                    return Forbidden("cannot_edit_privileged_member");
                if (patch.Role is not null && Roles.Rank(patch.Role) > Roles.Rank(Roles.Warrior))
                    return Forbidden("cannot_grant_privileged_role");
            }
            if (patch.Role is not null && !Roles.IsValid(Roles.Normalize(patch.Role)))
                return Results.BadRequest(new { error = "invalid_role" });

            var before = Snapshot(member);
            if (patch.CanLogin.HasValue) member.CanLogin = patch.CanLogin.Value;
            if (patch.Fp.HasValue) member.FormationPermission = patch.Fp.Value;
            if (patch.Ftp.HasValue) member.FootagePermission = patch.Ftp.Value;
            if (patch.Role is not null) member.Role = Roles.Normalize(patch.Role);
            member.UpdatedBy = actor;
            member.UpdatedUtc = DateTime.UtcNow;

            db.AuditLogs.Add(new AuditLog
            {
                ActorName = actor,
                Action = "member.permission.update",
                TargetType = "Member",
                TargetId = id.ToString(),
                BeforeJson = before,
                AfterJson = Snapshot(member),
                Utc = DateTime.UtcNow,
            });
            await db.SaveChangesAsync(ct);

            cache.Remove("pub:roster");
            cache.Remove("mem:roster");
            return Results.Ok(DtoMappers.ToCommanderMember(member));
        });

        // ── Registrations: review membership requests (PLAN §9A) ──────────
        group.MapGet("/registrations", async (string? status, WwmDbContext db, CancellationToken ct) =>
        {
            var q = db.Registrations.AsNoTracking();
            if (!string.IsNullOrEmpty(status)) q = q.Where(r => r.Status == status);
            var list = await q.OrderByDescending(r => r.SubmittedUtc).Take(500).ToListAsync(ct);
            return Results.Ok(list.Select(DtoMappers.ToRegistrationDto).ToList());
        });

        // Approve → create/update the linked Member with the granted flags so the
        // applicant can log in immediately. Audited; role-grant policy enforced.
        group.MapPost("/registrations/{id:int}/approve", async (
            int id, RegistrationApprove body, HttpContext ctx, WwmDbContext db,
            IMemoryCache cache, CancellationToken ct) =>
        {
            var actor = ctx.User.Username();
            var actorIsAdmin = ctx.User.Role() == Roles.Admin;

            var reg = await db.Registrations.FirstOrDefaultAsync(r => r.Id == id, ct);
            if (reg is null) return Results.NotFound();
            if (reg.Status != RegistrationStatus.Pending)
                return Results.Conflict(new { error = "already_reviewed" });

            var role = Roles.Normalize(body.Role ?? Roles.Warrior);
            if (!actorIsAdmin && Roles.Rank(role) > Roles.Rank(Roles.Warrior))
                return Forbidden("cannot_grant_privileged_role");

            var canLogin = body.CanLogin ?? true;
            var fp = body.Fp ?? false;
            var ftp = body.Ftp ?? false;
            var now = DateTime.UtcNow;

            // Link to an existing member by Discord, else by IGN; otherwise create one.
            var member = await db.Members.FirstOrDefaultAsync(m => m.Discord == reg.Discord, ct)
                         ?? await db.Members.FirstOrDefaultAsync(m => m.Ign == reg.Ign, ct);
            if (member is null)
            {
                member = new Member
                {
                    Ign = reg.Ign,
                    Discord = reg.Discord,
                    MainWeapon = reg.MainWeapon,
                    SecondaryWeapon = reg.SecondaryWeapon,
                    Saturday = reg.Saturday,
                    Sunday = reg.Sunday,
                    Role = role,
                    CanLogin = canLogin,
                    FormationPermission = fp,
                    FootagePermission = ftp,
                    UpdatedBy = actor,
                    UpdatedUtc = now,
                };
                db.Members.Add(member);
            }
            else
            {
                if (!actorIsAdmin && Roles.Rank(member.Role) > Roles.Rank(Roles.Warrior))
                    return Forbidden("cannot_edit_privileged_member");
                member.Discord ??= reg.Discord;
                member.Role = role;
                member.CanLogin = canLogin;
                member.FormationPermission = fp;
                member.FootagePermission = ftp;
                member.UpdatedBy = actor;
                member.UpdatedUtc = now;
            }
            await db.SaveChangesAsync(ct); // assigns member.Id for the link

            reg.Status = RegistrationStatus.Approved;
            reg.ReviewedBy = actor;
            reg.ReviewedUtc = now;
            reg.MemberId = member.Id;
            db.AuditLogs.Add(new AuditLog
            {
                ActorName = actor,
                Action = "registration.approve",
                TargetType = "Registration",
                TargetId = id.ToString(),
                AfterJson = JsonSerializer.Serialize(new { role, canLogin, fp, ftp, memberId = member.Id }),
                Utc = now,
            });
            await db.SaveChangesAsync(ct);

            cache.Remove("pub:roster");
            cache.Remove("mem:roster");
            return Results.Ok(DtoMappers.ToRegistrationDto(reg));
        });

        group.MapPost("/registrations/{id:int}/reject", async (
            int id, RegistrationReject body, HttpContext ctx, WwmDbContext db, CancellationToken ct) =>
        {
            var actor = ctx.User.Username();
            var reg = await db.Registrations.FirstOrDefaultAsync(r => r.Id == id, ct);
            if (reg is null) return Results.NotFound();
            if (reg.Status != RegistrationStatus.Pending)
                return Results.Conflict(new { error = "already_reviewed" });

            reg.Status = RegistrationStatus.Rejected;
            reg.ReviewedBy = actor;
            reg.ReviewedUtc = DateTime.UtcNow;
            reg.ReviewNote = body.Note?.Trim();
            db.AuditLogs.Add(new AuditLog
            {
                ActorName = actor,
                Action = "registration.reject",
                TargetType = "Registration",
                TargetId = id.ToString(),
                AfterJson = JsonSerializer.Serialize(new { note = reg.ReviewNote }),
                Utc = DateTime.UtcNow,
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(DtoMappers.ToRegistrationDto(reg));
        });
    }

    private static IResult Forbidden(string error) => Results.Json(new { error }, statusCode: 403);

    private static string Snapshot(Member m) => JsonSerializer.Serialize(new
    {
        m.Role,
        m.CanLogin,
        Fp = m.FormationPermission,
        Ftp = m.FootagePermission,
    });
}

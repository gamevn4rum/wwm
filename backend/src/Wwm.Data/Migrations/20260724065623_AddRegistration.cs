using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wwm.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRegistration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Registrations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Discord = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Uid = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    Ign = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    MainWeapon = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    SecondaryWeapon = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    Saturday = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Sunday = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    SubmittedUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ReviewedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ReviewedUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    MemberId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Registrations", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Registrations_Status",
                table: "Registrations",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Registrations");
        }
    }
}

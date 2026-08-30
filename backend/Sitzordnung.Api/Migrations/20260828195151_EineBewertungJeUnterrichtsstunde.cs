using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sitzordnung.Api.Migrations
{
    /// <inheritdoc />
    public partial class EineBewertungJeUnterrichtsstunde : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AppSettings");

            migrationBuilder.DropIndex(
                name: "IX_Ratings_CourseId_LessonDate",
                table: "Ratings");

            migrationBuilder.AddColumn<TimeOnly>(
                name: "LessonStart",
                table: "Ratings",
                type: "TEXT",
                nullable: false,
                defaultValue: new TimeOnly(0, 0, 0));

            // Nach der alten Regel konnte ein Schüler an einem Tag mehrfach bewertet
            // werden. Diese Bewertungen fallen jetzt in dieselbe Unterrichtsstunde und
            // würden den eindeutigen Index verletzen. Es bleibt die jeweils letzte
            // Bewertung stehen - so wie es die neue Regel vorsieht.
            migrationBuilder.Sql(@"
                DELETE FROM Ratings
                WHERE Id NOT IN (
                    SELECT MAX(Id) FROM Ratings
                    GROUP BY CourseId, StudentId, LessonDate, LessonStart
                );");

            migrationBuilder.CreateIndex(
                name: "IX_Ratings_CourseId_StudentId_LessonDate_LessonStart",
                table: "Ratings",
                columns: new[] { "CourseId", "StudentId", "LessonDate", "LessonStart" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Ratings_CourseId_StudentId_LessonDate_LessonStart",
                table: "Ratings");

            migrationBuilder.DropColumn(
                name: "LessonStart",
                table: "Ratings");

            migrationBuilder.CreateTable(
                name: "AppSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AllowRatingOutsideLesson = table.Column<bool>(type: "INTEGER", nullable: false),
                    ToleranceMinutes = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Ratings_CourseId_LessonDate",
                table: "Ratings",
                columns: new[] { "CourseId", "LessonDate" });
        }
    }
}

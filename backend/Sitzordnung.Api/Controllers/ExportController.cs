using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

/// <summary>
/// Export der Mitarbeitsbewertungen als CSV - jederzeit, für einen Kurs
/// oder über alle Kurse hinweg.
/// </summary>
[ApiController]
[Route("api/export")]
public class ExportController : ControllerBase
{
    private const string CsvContentType = "text/csv";

    private readonly AppDbContext _db;
    private readonly GradingService _grading;
    private readonly IClock _clock;

    public ExportController(AppDbContext db, GradingService grading, IClock clock)
    {
        _db = db;
        _grading = grading;
        _clock = clock;
    }

    private static string FileNamePart(string value)
    {
        var cleaned = new string(value.Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray());
        return cleaned.Trim('-');
    }

    /// <summary>Jede einzelne Bewertung als eigene Zeile.</summary>
    [HttpGet("ratings.csv")]
    public async Task<IActionResult> ExportRatings(
        [FromQuery] int? courseId,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var query = _db.Ratings
            .Include(r => r.Student)
            .Include(r => r.Course).ThenInclude(c => c!.SchoolClass)
            .Include(r => r.Course).ThenInclude(c => c!.Subject)
            .AsQueryable();

        if (courseId is not null)
        {
            query = query.Where(r => r.CourseId == courseId);
        }

        if (from is not null)
        {
            query = query.Where(r => r.LessonDate >= from);
        }

        if (to is not null)
        {
            query = query.Where(r => r.LessonDate <= to);
        }

        var ratings = await query
            .OrderBy(r => r.Course!.SchoolClass!.Name)
            .ThenBy(r => r.Course!.Subject!.Name)
            .ThenBy(r => r.LessonDate)
            .ThenBy(r => r.Student!.LastName)
            .ToListAsync(ct);

        var csv = new CsvBuilder();
        csv.AddRow("Datum", "Uhrzeit", "Klasse", "Fach", "Nachname", "Vorname", "Bewertung", "Punkte", "Kommentar");

        foreach (var rating in ratings)
        {
            csv.AddRow(
                rating.LessonDate,
                rating.CreatedAt.ToString("HH:mm"),
                rating.Course?.SchoolClass?.Name,
                rating.Course?.Subject?.Name,
                rating.Student?.LastName,
                rating.Student?.FirstName,
                Symbol(rating.Value),
                rating.Value,
                rating.Comment);
        }

        var name = $"bewertungen-{_clock.Now:yyyy-MM-dd}.csv";
        return File(csv.ToBytes(), CsvContentType, name);
    }

    /// <summary>
    /// Eine Zeile pro Schüler mit Punktestand und - falls ein Notenschlüssel
    /// hinterlegt ist - der daraus errechneten Note.
    /// </summary>
    [HttpGet("summary.csv")]
    public async Task<IActionResult> ExportSummary(
        [FromQuery] int? courseId,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var courses = await _db.Courses
            .Include(c => c.SchoolClass)
            .Include(c => c.Subject)
            .Where(c => courseId == null || c.Id == courseId)
            .OrderBy(c => c.SchoolClass!.Name).ThenBy(c => c.Subject!.Name)
            .ToListAsync(ct);

        if (courses.Count == 0)
        {
            return NotFound("Es gibt keinen passenden Kurs zum Exportieren.");
        }

        var csv = new CsvBuilder();
        csv.AddRow("Klasse", "Fach", "Nachname", "Vorname", "Punkte", "Anzahl Bewertungen", "Note");

        foreach (var course in courses)
        {
            var students = await _db.Students
                .Where(s => s.SchoolClassId == course.SchoolClassId)
                .OrderBy(s => s.LastName).ThenBy(s => s.FirstName)
                .ToListAsync(ct);

            var ratingQuery = _db.Ratings.Where(r => r.CourseId == course.Id);

            if (from is not null)
            {
                ratingQuery = ratingQuery.Where(r => r.LessonDate >= from);
            }

            if (to is not null)
            {
                ratingQuery = ratingQuery.Where(r => r.LessonDate <= to);
            }

            var ratings = await ratingQuery.Select(r => new { r.StudentId, r.Value }).ToListAsync(ct);
            var byStudent = ratings.ToLookup(r => r.StudentId);
            var scale = await _grading.GetEffectiveScaleAsync(course.Id, ct);

            foreach (var student in students)
            {
                var own = byStudent[student.Id].ToList();
                var points = own.Sum(r => r.Value);

                csv.AddRow(
                    course.SchoolClass?.Name,
                    course.Subject?.Name,
                    student.LastName,
                    student.FirstName,
                    points,
                    own.Count,
                    GradingService.ResolveGrade(scale, points));
            }
        }

        var suffix = courses.Count == 1
            ? $"{FileNamePart(courses[0].SchoolClass!.Name)}-{FileNamePart(courses[0].Subject!.Name)}"
            : "alle-kurse";

        return File(csv.ToBytes(), CsvContentType, $"mitarbeit-{suffix}-{_clock.Now:yyyy-MM-dd}.csv");
    }

    private static CsvLiteral Symbol(int value) => new(value switch
    {
        2 => "++",
        1 => "+",
        -1 => "-",
        -2 => "--",
        _ => value.ToString(),
    });
}

using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

[ApiController]
[Route("api")]
public class RatingsController : ControllerBase
{
    /// <summary>"--", "-", "+" und "++" - andere Werte nimmt die App nicht an.</summary>
    private static readonly int[] AllowedValues = { -2, -1, 1, 2 };

    private readonly AppDbContext _db;
    private readonly LessonService _lessons;
    private readonly GradingService _grading;
    private readonly IClock _clock;

    public RatingsController(AppDbContext db, LessonService lessons, GradingService grading, IClock clock)
    {
        _db = db;
        _lessons = lessons;
        _grading = grading;
        _clock = clock;
    }

    /// <summary>
    /// Welcher Unterrichtsstunde wird eine Bewertung gerade zugerechnet?
    /// Die Oberfläche zeigt das an, damit klar ist, worauf sich ein Klick bezieht.
    /// </summary>
    [HttpGet("courses/{courseId:int}/current-lesson")]
    public async Task<ActionResult<LessonSlotDto>> GetCurrentSlot(int courseId, CancellationToken ct)
    {
        if (!await _db.Courses.AnyAsync(c => c.Id == courseId, ct))
        {
            return NotFound();
        }

        return Ok(await _lessons.GetCurrentSlotAsync(courseId, ct));
    }

    /// <summary>
    /// Nimmt eine Bewertung entgegen. Bewertet werden darf jederzeit, aber je
    /// Unterrichtsstunde und Schüler nur einmal: liegt für dieselbe Stunde schon
    /// eine Bewertung vor, wird sie ersetzt statt ergänzt. Damit lässt sich ein
    /// Vertipper korrigieren, ohne dass sich Punkte in einer Stunde häufen.
    /// </summary>
    [HttpPost("ratings")]
    public async Task<ActionResult<RatingDto>> Create(RatingInput input, CancellationToken ct)
    {
        if (!AllowedValues.Contains(input.Value))
        {
            return BadRequest("Erlaubt sind nur die Bewertungen ++ (2), + (1), - (-1) und -- (-2).");
        }

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == input.CourseId, ct);
        if (course is null)
        {
            return BadRequest("Der angegebene Kurs existiert nicht.");
        }

        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == input.StudentId, ct);
        if (student is null)
        {
            return BadRequest("Der angegebene Schüler existiert nicht.");
        }

        if (student.SchoolClassId != course.SchoolClassId)
        {
            return BadRequest("Der Schüler gehört nicht zur Klasse dieses Kurses.");
        }

        var slot = await _lessons.GetCurrentSlotAsync(input.CourseId, ct);
        var start = TimeOnly.ParseExact(slot.StartTime, "HH:mm", CultureInfo.InvariantCulture);
        var now = _clock.Now;

        var rating = await _db.Ratings.FirstOrDefaultAsync(
            r => r.CourseId == input.CourseId && r.StudentId == input.StudentId
                 && r.LessonDate == slot.Date && r.LessonStart == start,
            ct);

        if (rating is null)
        {
            rating = new Rating
            {
                CourseId = input.CourseId,
                StudentId = input.StudentId,
                LessonDate = slot.Date,
                LessonStart = start,
            };
            _db.Ratings.Add(rating);
        }

        rating.Value = input.Value;
        rating.CreatedAt = now;
        rating.Comment = string.IsNullOrWhiteSpace(input.Comment) ? null : input.Comment.Trim();

        await _db.SaveChangesAsync(ct);

        return Ok(new RatingDto(
            rating.Id, rating.CourseId, rating.StudentId, rating.Value,
            rating.LessonDate, slot.StartTime, rating.CreatedAt, rating.Comment));
    }

    /// <summary>Nimmt eine Bewertung ganz zurück.</summary>
    [HttpDelete("ratings/{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var rating = await _db.Ratings.FindAsync(new object[] { id }, ct);
        if (rating is null)
        {
            return NotFound();
        }

        _db.Ratings.Remove(rating);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    /// <summary>Die letzte Bewertung eines Schülers in diesem Kurs zurücknehmen.</summary>
    [HttpPost("courses/{courseId:int}/students/{studentId:int}/undo")]
    public async Task<IActionResult> UndoLast(int courseId, int studentId, CancellationToken ct)
    {
        // Die Id wächst mit jeder Bewertung, ist also die zuletzt vergebene.
        // Nach CreatedAt zu sortieren geht nicht - SQLite kann DateTimeOffset
        // nicht in ORDER BY verwenden.
        var last = await _db.Ratings
            .Where(r => r.CourseId == courseId && r.StudentId == studentId)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);

        if (last is null)
        {
            return NotFound("Für diesen Schüler gibt es noch keine Bewertung.");
        }

        _db.Ratings.Remove(last);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    /// <summary>Alle Einzelbewertungen eines Kurses, optional auf einen Zeitraum eingegrenzt.</summary>
    [HttpGet("courses/{courseId:int}/ratings")]
    public async Task<ActionResult<IEnumerable<RatingDto>>> GetByCourse(
        int courseId, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct)
    {
        if (!await _db.Courses.AnyAsync(c => c.Id == courseId, ct))
        {
            return NotFound();
        }

        var query = _db.Ratings.Where(r => r.CourseId == courseId);

        if (from is not null)
        {
            query = query.Where(r => r.LessonDate >= from);
        }

        if (to is not null)
        {
            query = query.Where(r => r.LessonDate <= to);
        }

        var ratings = await query
            .OrderByDescending(r => r.LessonDate).ThenByDescending(r => r.Id)
            .ToListAsync(ct);

        return Ok(ratings.Select(r => new RatingDto(
            r.Id, r.CourseId, r.StudentId, r.Value, r.LessonDate,
            r.LessonStart.ToString("HH\\:mm"), r.CreatedAt, r.Comment)));
    }

    /// <summary>
    /// Punktestand aller Schüler des Kurses. Jeder startet bei 0; die Punkte sind
    /// die Summe aller Bewertungen im gewählten Zeitraum.
    /// </summary>
    [HttpGet("courses/{courseId:int}/scoreboard")]
    public async Task<ActionResult<CourseScoreboardDto>> GetScoreboard(
        int courseId, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct)
    {
        var course = await _db.Courses
            .Include(c => c.SchoolClass)
            .Include(c => c.Subject)
            .FirstOrDefaultAsync(c => c.Id == courseId, ct);

        if (course is null)
        {
            return NotFound();
        }

        var today = DateOnly.FromDateTime(_clock.Now.DateTime);

        var students = await _db.Students
            .Where(s => s.SchoolClassId == course.SchoolClassId)
            .OrderBy(s => s.LastName).ThenBy(s => s.FirstName)
            .ToListAsync(ct);

        var query = _db.Ratings.Where(r => r.CourseId == courseId);

        if (from is not null)
        {
            query = query.Where(r => r.LessonDate >= from);
        }

        if (to is not null)
        {
            query = query.Where(r => r.LessonDate <= to);
        }

        var ratings = await query
            .Select(r => new { r.StudentId, r.Value, r.LessonDate, r.LessonStart })
            .ToListAsync(ct);

        var byStudent = ratings.ToLookup(r => r.StudentId);
        var scale = await _grading.GetEffectiveScaleAsync(courseId, ct);

        // Was in der aktuellen Stunde schon vergeben wurde, zeigt die Oberfläche an.
        var slot = await _lessons.GetCurrentSlotAsync(courseId, ct);
        var slotStart = TimeOnly.ParseExact(slot.StartTime, "HH:mm", CultureInfo.InvariantCulture);

        var rows = students.Select(s =>
        {
            var own = byStudent[s.Id].ToList();
            var points = own.Sum(r => r.Value);

            return new StudentScoreDto(
                s.Id,
                s.FirstName,
                s.LastName,
                points,
                own.Count,
                own.Where(r => r.LessonDate == today).Sum(r => r.Value),
                GradingService.ResolveGrade(scale, points),
                own.FirstOrDefault(r => r.LessonDate == slot.Date && r.LessonStart == slotStart)?.Value);
        }).ToList();

        return Ok(new CourseScoreboardDto(
            course.Id,
            course.SchoolClass!.Name,
            course.Subject!.Name,
            today,
            slot,
            rows));
    }
}

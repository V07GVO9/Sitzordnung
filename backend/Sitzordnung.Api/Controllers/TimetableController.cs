using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

[ApiController]
[Route("api/timetable")]
public class TimetableController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly LessonService _lessons;

    public TimetableController(AppDbContext db, LessonService lessons)
    {
        _db = db;
        _lessons = lessons;
    }

    private static bool TryParseTime(string value, out TimeOnly time) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);

    private static TimetableEntryDto ToDto(TimetableEntry e) => new(
        e.Id,
        e.CourseId,
        e.Course?.SchoolClass?.Name ?? string.Empty,
        e.Course?.Subject?.Name ?? string.Empty,
        e.DayOfWeek,
        e.StartTime.ToString("HH\\:mm"),
        e.EndTime.ToString("HH\\:mm"),
        e.Room);

    /// <summary>
    /// Die Uhrzeiten werden erst nach dem Laden formatiert - TimeOnly.ToString
    /// lässt sich nicht in SQL übersetzen.
    /// </summary>
    private IQueryable<TimetableEntry> WithCourse() => _db.TimetableEntries
        .Include(e => e.Course).ThenInclude(c => c!.SchoolClass)
        .Include(e => e.Course).ThenInclude(c => c!.Subject);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TimetableEntryDto>>> GetAll(CancellationToken ct)
    {
        var entries = await WithCourse()
            .OrderBy(e => e.DayOfWeek).ThenBy(e => e.StartTime)
            .ToListAsync(ct);

        return Ok(entries.Select(ToDto));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TimetableEntryDto>> Get(int id, CancellationToken ct)
    {
        var entry = await WithCourse().FirstOrDefaultAsync(e => e.Id == id, ct);
        return entry is null ? NotFound() : Ok(ToDto(entry));
    }

    /// <summary>Welcher Unterricht läuft gerade? Grundlage für die Freigabe der Bewertung.</summary>
    [HttpGet("current")]
    public async Task<ActionResult<CurrentLessonDto>> GetCurrent(CancellationToken ct) =>
        Ok(await _lessons.GetCurrentLessonAsync(ct));

    [HttpPost]
    public async Task<ActionResult<TimetableEntryDto>> Create(TimetableEntryInput input, CancellationToken ct)
    {
        var validation = await ValidateAsync(input, null, ct);
        if (validation is not null)
        {
            return validation;
        }

        TryParseTime(input.StartTime, out var start);
        TryParseTime(input.EndTime, out var end);

        var entry = new TimetableEntry
        {
            CourseId = input.CourseId,
            DayOfWeek = input.DayOfWeek,
            StartTime = start,
            EndTime = end,
            Room = string.IsNullOrWhiteSpace(input.Room) ? null : input.Room.Trim(),
        };

        _db.TimetableEntries.Add(entry);
        await _db.SaveChangesAsync(ct);

        var created = await WithCourse().FirstAsync(e => e.Id == entry.Id, ct);
        return CreatedAtAction(nameof(Get), new { id = entry.Id }, ToDto(created));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<TimetableEntryDto>> Update(int id, TimetableEntryInput input, CancellationToken ct)
    {
        var entry = await _db.TimetableEntries.FindAsync(new object[] { id }, ct);
        if (entry is null)
        {
            return NotFound();
        }

        var validation = await ValidateAsync(input, id, ct);
        if (validation is not null)
        {
            return validation;
        }

        TryParseTime(input.StartTime, out var start);
        TryParseTime(input.EndTime, out var end);

        entry.CourseId = input.CourseId;
        entry.DayOfWeek = input.DayOfWeek;
        entry.StartTime = start;
        entry.EndTime = end;
        entry.Room = string.IsNullOrWhiteSpace(input.Room) ? null : input.Room.Trim();

        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(await WithCourse().FirstAsync(e => e.Id == id, ct)));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var entry = await _db.TimetableEntries.FindAsync(new object[] { id }, ct);
        if (entry is null)
        {
            return NotFound();
        }

        _db.TimetableEntries.Remove(entry);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    /// <summary>
    /// Prüft Kurs, Uhrzeiten und Überschneidungen. Gibt null zurück, wenn alles passt.
    /// </summary>
    private async Task<ActionResult?> ValidateAsync(TimetableEntryInput input, int? ignoreId, CancellationToken ct)
    {
        if (!await _db.Courses.AnyAsync(c => c.Id == input.CourseId, ct))
        {
            return BadRequest("Der angegebene Kurs existiert nicht.");
        }

        if (!TryParseTime(input.StartTime, out var start) || !TryParseTime(input.EndTime, out var end))
        {
            return BadRequest("Die Uhrzeiten müssen im Format HH:mm angegeben werden.");
        }

        if (end <= start)
        {
            return BadRequest("Das Ende der Stunde muss nach ihrem Beginn liegen.");
        }

        // Zwei Stunden zur selben Zeit wären im Stundenplan nicht auflösbar.
        var sameDay = await _db.TimetableEntries
            .Where(e => e.DayOfWeek == input.DayOfWeek && (ignoreId == null || e.Id != ignoreId))
            .ToListAsync(ct);

        var overlap = sameDay.FirstOrDefault(e => start < e.EndTime && end > e.StartTime);
        if (overlap is not null)
        {
            return Conflict(
                $"Die Zeit überschneidet sich mit einer anderen Stunde " +
                $"({overlap.StartTime:HH\\:mm}-{overlap.EndTime:HH\\:mm} Uhr).");
        }

        return null;
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

/// <summary>
/// Notenschlüssel: ab wie vielen Mitarbeitspunkten gilt welche Note.
/// Ein Kurs kann einen eigenen Schlüssel haben, sonst gilt der globale.
/// </summary>
[ApiController]
[Route("api/gradescales")]
public class GradeScalesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly GradingService _grading;

    public GradeScalesController(AppDbContext db, GradingService grading)
    {
        _db = db;
        _grading = grading;
    }

    private static GradeScaleDto ToDto(GradeScale scale) => new(
        scale.Id,
        scale.CourseId,
        scale.Name,
        scale.CourseId is null,
        scale.Entries
            .OrderByDescending(e => e.MinPoints)
            .Select(e => new GradeScaleEntryDto(e.MinPoints, e.Grade))
            .ToList());

    [HttpGet]
    public async Task<ActionResult<IEnumerable<GradeScaleDto>>> GetAll(CancellationToken ct)
    {
        var scales = await _db.GradeScales.Include(g => g.Entries).ToListAsync(ct);
        return Ok(scales.Select(ToDto));
    }

    /// <summary>Der globale Standardschlüssel für alle Kurse ohne eigenen Schlüssel.</summary>
    [HttpGet("global")]
    public async Task<ActionResult<GradeScaleDto>> GetGlobal(CancellationToken ct)
    {
        var scale = await _db.GradeScales
            .Include(g => g.Entries)
            .FirstOrDefaultAsync(g => g.CourseId == null, ct);

        return scale is null ? NotFound("Es ist kein globaler Notenschlüssel hinterlegt.") : Ok(ToDto(scale));
    }

    [HttpPut("global")]
    public async Task<ActionResult<GradeScaleDto>> SaveGlobal(GradeScaleInput input, CancellationToken ct) =>
        await SaveAsync(null, input, ct);

    /// <summary>
    /// Der Schlüssel, der für diesen Kurs tatsächlich angewendet wird -
    /// entweder sein eigener oder der globale.
    /// </summary>
    [HttpGet("/api/courses/{courseId:int}/gradescale")]
    public async Task<ActionResult<GradeScaleDto>> GetForCourse(int courseId, CancellationToken ct)
    {
        if (!await _db.Courses.AnyAsync(c => c.Id == courseId, ct))
        {
            return NotFound();
        }

        var scale = await _grading.GetEffectiveScaleAsync(courseId, ct);
        return scale is null ? NotFound("Für diesen Kurs ist kein Notenschlüssel hinterlegt.") : Ok(ToDto(scale));
    }

    [HttpPut("/api/courses/{courseId:int}/gradescale")]
    public async Task<ActionResult<GradeScaleDto>> SaveForCourse(
        int courseId, GradeScaleInput input, CancellationToken ct)
    {
        if (!await _db.Courses.AnyAsync(c => c.Id == courseId, ct))
        {
            return NotFound("Der Kurs existiert nicht.");
        }

        return await SaveAsync(courseId, input, ct);
    }

    /// <summary>Entfernt den kursspezifischen Schlüssel, danach gilt wieder der globale.</summary>
    [HttpDelete("/api/courses/{courseId:int}/gradescale")]
    public async Task<IActionResult> DeleteForCourse(int courseId, CancellationToken ct)
    {
        var scale = await _db.GradeScales.FirstOrDefaultAsync(g => g.CourseId == courseId, ct);
        if (scale is null)
        {
            return NotFound();
        }

        _db.GradeScales.Remove(scale);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    private async Task<ActionResult<GradeScaleDto>> SaveAsync(int? courseId, GradeScaleInput input, CancellationToken ct)
    {
        if (input.Entries.Count == 0)
        {
            return BadRequest("Ein Notenschlüssel braucht mindestens eine Stufe.");
        }

        if (input.Entries.Any(e => string.IsNullOrWhiteSpace(e.Grade)))
        {
            return BadRequest("Jede Stufe braucht eine Note.");
        }

        if (input.Entries.GroupBy(e => e.MinPoints).Any(g => g.Count() > 1))
        {
            return BadRequest("Zwei Stufen dürfen nicht dieselbe Punktgrenze haben.");
        }

        var scale = await _db.GradeScales
            .Include(g => g.Entries)
            .FirstOrDefaultAsync(g => g.CourseId == courseId, ct);

        if (scale is null)
        {
            scale = new GradeScale { CourseId = courseId };
            _db.GradeScales.Add(scale);
        }
        else
        {
            _db.GradeScaleEntries.RemoveRange(scale.Entries);
        }

        scale.Name = string.IsNullOrWhiteSpace(input.Name)
            ? (courseId is null ? "Standard-Notenschlüssel" : "Notenschlüssel")
            : input.Name.Trim();

        scale.Entries = input.Entries
            .Select(e => new GradeScaleEntry { MinPoints = e.MinPoints, Grade = e.Grade.Trim() })
            .ToList();

        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(scale));
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Controllers;

[ApiController]
[Route("api")]
public class SeatingPlansController : ControllerBase
{
    private readonly AppDbContext _db;

    public SeatingPlansController(AppDbContext db)
    {
        _db = db;
    }

    private static SeatingPlanDto ToDto(SeatingPlan plan) => new(
        plan.Id,
        plan.CourseId,
        plan.Name,
        plan.Rows,
        plan.Columns,
        plan.Seats
            .OrderBy(s => s.Row).ThenBy(s => s.Column)
            .Select(s => new SeatDto(s.StudentId, s.Row, s.Column))
            .ToList());

    [HttpGet("courses/{courseId:int}/seatingplans")]
    public async Task<ActionResult<IEnumerable<SeatingPlanDto>>> GetByCourse(int courseId, CancellationToken ct)
    {
        if (!await _db.Courses.AnyAsync(c => c.Id == courseId, ct))
        {
            return NotFound();
        }

        var plans = await _db.SeatingPlans
            .Include(p => p.Seats)
            .Where(p => p.CourseId == courseId)
            .OrderBy(p => p.Id)
            .ToListAsync(ct);

        return Ok(plans.Select(ToDto));
    }

    [HttpGet("seatingplans/{id:int}")]
    public async Task<ActionResult<SeatingPlanDto>> Get(int id, CancellationToken ct)
    {
        var plan = await _db.SeatingPlans
            .Include(p => p.Seats)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

        return plan is null ? NotFound() : Ok(ToDto(plan));
    }

    /// <summary>
    /// Legt eine weitere Sitzordnung für den Kurs an. Mehr als
    /// <see cref="SeatingPlan.MaxPlansPerCourse"/> Pläne pro Kurs sind nicht vorgesehen.
    /// </summary>
    [HttpPost("courses/{courseId:int}/seatingplans")]
    public async Task<ActionResult<SeatingPlanDto>> Create(
        int courseId, SeatingPlanInput input, CancellationToken ct)
    {
        if (!await _db.Courses.AnyAsync(c => c.Id == courseId, ct))
        {
            return NotFound("Der Kurs existiert nicht.");
        }

        var existing = await _db.SeatingPlans.CountAsync(p => p.CourseId == courseId, ct);
        if (existing >= SeatingPlan.MaxPlansPerCourse)
        {
            return Conflict($"Pro Kurs sind höchstens {SeatingPlan.MaxPlansPerCourse} Sitzordnungen möglich.");
        }

        var plan = new SeatingPlan
        {
            CourseId = courseId,
            Name = string.IsNullOrWhiteSpace(input.Name) ? $"Sitzordnung {existing + 1}" : input.Name.Trim(),
            Rows = input.Rows,
            Columns = input.Columns,
        };

        _db.SeatingPlans.Add(plan);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = plan.Id }, ToDto(plan));
    }

    [HttpPut("seatingplans/{id:int}")]
    public async Task<ActionResult<SeatingPlanDto>> Update(int id, SeatingPlanInput input, CancellationToken ct)
    {
        var plan = await _db.SeatingPlans
            .Include(p => p.Seats)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

        if (plan is null)
        {
            return NotFound();
        }

        plan.Name = input.Name.Trim();
        plan.Rows = input.Rows;
        plan.Columns = input.Columns;

        // Plätze, die durch ein kleineres Raster herausfallen, werden freigeräumt.
        var dropped = plan.Seats.Where(s => s.Row >= plan.Rows || s.Column >= plan.Columns).ToList();
        _db.Seats.RemoveRange(dropped);

        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(plan));
    }

    /// <summary>
    /// Speichert die komplette Belegung nach dem Verschieben per Drag and Drop.
    /// Die bisherige Belegung wird dabei ersetzt.
    /// </summary>
    [HttpPut("seatingplans/{id:int}/layout")]
    public async Task<ActionResult<SeatingPlanDto>> SaveLayout(int id, SeatLayoutInput input, CancellationToken ct)
    {
        var plan = await _db.SeatingPlans
            .Include(p => p.Seats)
            .Include(p => p.Course)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

        if (plan is null)
        {
            return NotFound();
        }

        if (input.Seats.Any(s => s.Row >= input.Rows || s.Column >= input.Columns))
        {
            return BadRequest("Mindestens ein Platz liegt außerhalb des Rasters.");
        }

        if (input.Seats.GroupBy(s => (s.Row, s.Column)).Any(g => g.Count() > 1))
        {
            return BadRequest("Auf einem Platz darf nur ein Schüler sitzen.");
        }

        if (input.Seats.GroupBy(s => s.StudentId).Any(g => g.Count() > 1))
        {
            return BadRequest("Ein Schüler kann nur an einem Platz sitzen.");
        }

        // Es dürfen nur Schüler der Klasse gesetzt werden, zu der der Kurs gehört.
        var studentIds = input.Seats.Select(s => s.StudentId).Distinct().ToList();
        var validIds = await _db.Students
            .Where(s => s.SchoolClassId == plan.Course!.SchoolClassId && studentIds.Contains(s.Id))
            .Select(s => s.Id)
            .ToListAsync(ct);

        if (validIds.Count != studentIds.Count)
        {
            return BadRequest("Mindestens ein Schüler gehört nicht zur Klasse dieses Kurses.");
        }

        plan.Rows = input.Rows;
        plan.Columns = input.Columns;

        _db.Seats.RemoveRange(plan.Seats);
        await _db.SaveChangesAsync(ct);

        plan.Seats = input.Seats
            .Select(s => new Seat
            {
                SeatingPlanId = plan.Id,
                StudentId = s.StudentId,
                Row = s.Row,
                Column = s.Column,
            })
            .ToList();

        _db.Seats.AddRange(plan.Seats);
        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(plan));
    }

    [HttpDelete("seatingplans/{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var plan = await _db.SeatingPlans.FindAsync(new object[] { id }, ct);
        if (plan is null)
        {
            return NotFound();
        }

        _db.SeatingPlans.Remove(plan);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }
}

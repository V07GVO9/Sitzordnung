using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Controllers;

/// <summary>
/// Kurse sind die Verbindung "diese Klasse in diesem Fach". Alles Weitere -
/// Sitzordnung, Stundenplan, Bewertungen - hängt an einem Kurs.
/// </summary>
[ApiController]
[Route("api/courses")]
public class CoursesController : ControllerBase
{
    private readonly AppDbContext _db;

    public CoursesController(AppDbContext db)
    {
        _db = db;
    }

    private static CourseDto ToDto(Course c) => new(
        c.Id,
        c.SchoolClassId,
        c.SchoolClass?.Name ?? string.Empty,
        c.SubjectId,
        c.Subject?.Name ?? string.Empty,
        c.Subject?.ShortName ?? string.Empty,
        c.SeatingPlans.Count);

    private IQueryable<Course> WithDetails() => _db.Courses
        .Include(c => c.SchoolClass)
        .Include(c => c.Subject)
        .Include(c => c.SeatingPlans);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CourseDto>>> GetAll(CancellationToken ct)
    {
        var courses = await WithDetails()
            .OrderBy(c => c.SchoolClass!.Name).ThenBy(c => c.Subject!.Name)
            .ToListAsync(ct);

        return Ok(courses.Select(ToDto));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CourseDto>> Get(int id, CancellationToken ct)
    {
        var course = await WithDetails().FirstOrDefaultAsync(c => c.Id == id, ct);
        return course is null ? NotFound() : Ok(ToDto(course));
    }

    /// <summary>Die Schüler der Klasse, die zu diesem Kurs gehört.</summary>
    [HttpGet("{id:int}/students")]
    public async Task<ActionResult<IEnumerable<StudentDto>>> GetStudents(int id, CancellationToken ct)
    {
        var course = await _db.Courses.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (course is null)
        {
            return NotFound();
        }

        var students = await _db.Students
            .Where(s => s.SchoolClassId == course.SchoolClassId)
            .OrderBy(s => s.LastName).ThenBy(s => s.FirstName)
            .ToListAsync(ct);

        return Ok(students.Select(s => new StudentDto(
            s.Id,
            s.FirstName,
            s.LastName,
            s.SchoolClassId,
            s.PhotoFileName is not null,
            s.PhotoFileName is not null ? $"/api/students/{s.Id}/photo" : null)));
    }

    [HttpPost]
    public async Task<ActionResult<CourseDto>> Create(CourseInput input, CancellationToken ct)
    {
        if (!await _db.SchoolClasses.AnyAsync(c => c.Id == input.SchoolClassId, ct))
        {
            return BadRequest("Die angegebene Klasse existiert nicht.");
        }

        if (!await _db.Subjects.AnyAsync(s => s.Id == input.SubjectId, ct))
        {
            return BadRequest("Das angegebene Fach existiert nicht.");
        }

        var exists = await _db.Courses.AnyAsync(
            c => c.SchoolClassId == input.SchoolClassId && c.SubjectId == input.SubjectId, ct);
        if (exists)
        {
            return Conflict("Diese Klasse ist in diesem Fach bereits angelegt.");
        }

        var course = new Course { SchoolClassId = input.SchoolClassId, SubjectId = input.SubjectId };
        _db.Courses.Add(course);
        await _db.SaveChangesAsync(ct);

        var created = await WithDetails().FirstAsync(c => c.Id == course.Id, ct);
        return CreatedAtAction(nameof(Get), new { id = course.Id }, ToDto(created));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var course = await _db.Courses.FindAsync(new object[] { id }, ct);
        if (course is null)
        {
            return NotFound();
        }

        _db.Courses.Remove(course);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }
}

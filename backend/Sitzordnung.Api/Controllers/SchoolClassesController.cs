using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Controllers;

[ApiController]
[Route("api/classes")]
public class SchoolClassesController : ControllerBase
{
    private readonly AppDbContext _db;

    public SchoolClassesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<SchoolClassDto>>> GetAll(CancellationToken ct)
    {
        var classes = await _db.SchoolClasses
            .OrderBy(c => c.Name)
            .Select(c => new SchoolClassDto(c.Id, c.Name, c.Students.Count))
            .ToListAsync(ct);

        return Ok(classes);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<SchoolClassDto>> Get(int id, CancellationToken ct)
    {
        var schoolClass = await _db.SchoolClasses
            .Where(c => c.Id == id)
            .Select(c => new SchoolClassDto(c.Id, c.Name, c.Students.Count))
            .FirstOrDefaultAsync(ct);

        return schoolClass is null ? NotFound() : Ok(schoolClass);
    }

    [HttpPost]
    public async Task<ActionResult<SchoolClassDto>> Create(SchoolClassInput input, CancellationToken ct)
    {
        var name = input.Name.Trim();
        if (await _db.SchoolClasses.AnyAsync(c => c.Name == name, ct))
        {
            return Conflict($"Die Klasse '{name}' gibt es bereits.");
        }

        var schoolClass = new SchoolClass { Name = name };
        _db.SchoolClasses.Add(schoolClass);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = schoolClass.Id },
            new SchoolClassDto(schoolClass.Id, schoolClass.Name, 0));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<SchoolClassDto>> Update(int id, SchoolClassInput input, CancellationToken ct)
    {
        var schoolClass = await _db.SchoolClasses.FindAsync(new object[] { id }, ct);
        if (schoolClass is null)
        {
            return NotFound();
        }

        var name = input.Name.Trim();
        if (await _db.SchoolClasses.AnyAsync(c => c.Name == name && c.Id != id, ct))
        {
            return Conflict($"Die Klasse '{name}' gibt es bereits.");
        }

        schoolClass.Name = name;
        await _db.SaveChangesAsync(ct);

        var count = await _db.Students.CountAsync(s => s.SchoolClassId == id, ct);
        return Ok(new SchoolClassDto(schoolClass.Id, schoolClass.Name, count));
    }

    /// <summary>
    /// Löscht die Klasse samt Schülern, Kursen, Sitzordnungen und Bewertungen.
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var schoolClass = await _db.SchoolClasses.FindAsync(new object[] { id }, ct);
        if (schoolClass is null)
        {
            return NotFound();
        }

        _db.SchoolClasses.Remove(schoolClass);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }
}

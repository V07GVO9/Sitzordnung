using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Controllers;

[ApiController]
[Route("api/subjects")]
public class SubjectsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SubjectsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<SubjectDto>>> GetAll(CancellationToken ct)
    {
        var subjects = await _db.Subjects
            .OrderBy(s => s.Name)
            .Select(s => new SubjectDto(s.Id, s.Name, s.ShortName))
            .ToListAsync(ct);

        return Ok(subjects);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<SubjectDto>> Get(int id, CancellationToken ct)
    {
        var subject = await _db.Subjects
            .Where(s => s.Id == id)
            .Select(s => new SubjectDto(s.Id, s.Name, s.ShortName))
            .FirstOrDefaultAsync(ct);

        return subject is null ? NotFound() : Ok(subject);
    }

    [HttpPost]
    public async Task<ActionResult<SubjectDto>> Create(SubjectInput input, CancellationToken ct)
    {
        var name = input.Name.Trim();
        if (await _db.Subjects.AnyAsync(s => s.Name == name, ct))
        {
            return Conflict($"Das Fach '{name}' gibt es bereits.");
        }

        var subject = new Subject { Name = name, ShortName = input.ShortName.Trim() };
        _db.Subjects.Add(subject);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = subject.Id },
            new SubjectDto(subject.Id, subject.Name, subject.ShortName));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<SubjectDto>> Update(int id, SubjectInput input, CancellationToken ct)
    {
        var subject = await _db.Subjects.FindAsync(new object[] { id }, ct);
        if (subject is null)
        {
            return NotFound();
        }

        var name = input.Name.Trim();
        if (await _db.Subjects.AnyAsync(s => s.Name == name && s.Id != id, ct))
        {
            return Conflict($"Das Fach '{name}' gibt es bereits.");
        }

        subject.Name = name;
        subject.ShortName = input.ShortName.Trim();
        await _db.SaveChangesAsync(ct);

        return Ok(new SubjectDto(subject.Id, subject.Name, subject.ShortName));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var subject = await _db.Subjects.FindAsync(new object[] { id }, ct);
        if (subject is null)
        {
            return NotFound();
        }

        _db.Subjects.Remove(subject);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

[ApiController]
[Route("api")]
public class StudentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PhotoStorage _photos;

    public StudentsController(AppDbContext db, PhotoStorage photos)
    {
        _db = db;
        _photos = photos;
    }

    private static StudentDto ToDto(Student s) => new(
        s.Id,
        s.FirstName,
        s.LastName,
        s.SchoolClassId,
        s.PhotoFileName is not null,
        s.PhotoFileName is not null ? $"/api/students/{s.Id}/photo" : null);

    [HttpGet("classes/{classId:int}/students")]
    public async Task<ActionResult<IEnumerable<StudentDto>>> GetByClass(int classId, CancellationToken ct)
    {
        if (!await _db.SchoolClasses.AnyAsync(c => c.Id == classId, ct))
        {
            return NotFound();
        }

        var students = await _db.Students
            .Where(s => s.SchoolClassId == classId)
            .OrderBy(s => s.LastName).ThenBy(s => s.FirstName)
            .ToListAsync(ct);

        return Ok(students.Select(ToDto));
    }

    [HttpGet("students/{id:int}")]
    public async Task<ActionResult<StudentDto>> Get(int id, CancellationToken ct)
    {
        var student = await _db.Students.FindAsync(new object[] { id }, ct);
        return student is null ? NotFound() : Ok(ToDto(student));
    }

    [HttpPost("classes/{classId:int}/students")]
    public async Task<ActionResult<StudentDto>> Create(int classId, StudentInput input, CancellationToken ct)
    {
        if (!await _db.SchoolClasses.AnyAsync(c => c.Id == classId, ct))
        {
            return NotFound("Die Klasse existiert nicht.");
        }

        var student = new Student
        {
            FirstName = input.FirstName.Trim(),
            LastName = input.LastName.Trim(),
            SchoolClassId = classId,
        };

        _db.Students.Add(student);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = student.Id }, ToDto(student));
    }

    /// <summary>
    /// Legt mehrere Schüler auf einmal an - gedacht für eingefügte Namenslisten.
    /// </summary>
    [HttpPost("classes/{classId:int}/students/import")]
    public async Task<ActionResult<IEnumerable<StudentDto>>> Import(
        int classId, List<StudentImportInput> input, CancellationToken ct)
    {
        if (!await _db.SchoolClasses.AnyAsync(c => c.Id == classId, ct))
        {
            return NotFound("Die Klasse existiert nicht.");
        }

        var students = input
            .Where(i => !string.IsNullOrWhiteSpace(i.FirstName) || !string.IsNullOrWhiteSpace(i.LastName))
            .Select(i => new Student
            {
                FirstName = i.FirstName.Trim(),
                LastName = i.LastName.Trim(),
                SchoolClassId = classId,
            })
            .ToList();

        if (students.Count == 0)
        {
            return BadRequest("Die Liste enthält keine verwertbaren Namen.");
        }

        _db.Students.AddRange(students);
        await _db.SaveChangesAsync(ct);

        return Ok(students.Select(ToDto));
    }

    [HttpPut("students/{id:int}")]
    public async Task<ActionResult<StudentDto>> Update(int id, StudentInput input, CancellationToken ct)
    {
        var student = await _db.Students.FindAsync(new object[] { id }, ct);
        if (student is null)
        {
            return NotFound();
        }

        student.FirstName = input.FirstName.Trim();
        student.LastName = input.LastName.Trim();
        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(student));
    }

    [HttpDelete("students/{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var student = await _db.Students.FindAsync(new object[] { id }, ct);
        if (student is null)
        {
            return NotFound();
        }

        _photos.Delete(student.PhotoFileName);
        _db.Students.Remove(student);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    [HttpPost("students/{id:int}/photo")]
    [RequestSizeLimit(PhotoStorage.MaxBytes + 4096)]
    public async Task<ActionResult<StudentDto>> UploadPhoto(int id, IFormFile file, CancellationToken ct)
    {
        var student = await _db.Students.FindAsync(new object[] { id }, ct);
        if (student is null)
        {
            return NotFound();
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest("Es wurde keine Datei übertragen.");
        }

        if (file.Length > PhotoStorage.MaxBytes)
        {
            return BadRequest("Das Foto ist größer als 5 MB.");
        }

        if (!PhotoStorage.IsAllowedContentType(file.ContentType))
        {
            return BadRequest("Erlaubt sind nur JPEG-, PNG-, WebP- und GIF-Bilder.");
        }

        var previous = student.PhotoFileName;
        student.PhotoFileName = await _photos.SaveAsync(id, file, ct);
        await _db.SaveChangesAsync(ct);

        _photos.Delete(previous);

        return Ok(ToDto(student));
    }

    [HttpGet("students/{id:int}/photo")]
    public async Task<IActionResult> GetPhoto(int id, CancellationToken ct)
    {
        var student = await _db.Students.FindAsync(new object[] { id }, ct);
        if (student?.PhotoFileName is null)
        {
            return NotFound();
        }

        var path = _photos.ResolvePath(student.PhotoFileName);
        if (path is null || !System.IO.File.Exists(path))
        {
            return NotFound();
        }

        return PhysicalFile(path, PhotoStorage.ContentTypeFor(student.PhotoFileName));
    }

    [HttpDelete("students/{id:int}/photo")]
    public async Task<ActionResult<StudentDto>> DeletePhoto(int id, CancellationToken ct)
    {
        var student = await _db.Students.FindAsync(new object[] { id }, ct);
        if (student is null)
        {
            return NotFound();
        }

        _photos.Delete(student.PhotoFileName);
        student.PhotoFileName = null;
        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(student));
    }
}

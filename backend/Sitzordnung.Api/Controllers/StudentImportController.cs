using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

/// <summary>
/// Übernimmt Schülerlisten aus einer Tabelle, wie WebUntis sie exportiert.
/// Wie beim Stundenplan gilt: erst eine Vorschau, dann das Übernehmen.
/// </summary>
[ApiController]
[Route("api/students/import")]
public class StudentImportController : ControllerBase
{
    private const long MaxBytes = 2 * 1024 * 1024;

    private readonly AppDbContext _db;
    private readonly StudentImportService _import;

    public StudentImportController(AppDbContext db, StudentImportService import)
    {
        _db = db;
        _import = import;
    }

    [HttpPost("preview")]
    [RequestSizeLimit(MaxBytes + 4096)]
    public async Task<ActionResult<StudentImportPreviewDto>> Preview(
        IFormFile? file,
        [FromForm] string? content,
        CancellationToken ct)
    {
        string text;

        if (file is not null && file.Length > 0)
        {
            if (file.Length > MaxBytes)
            {
                return BadRequest("Die Datei ist größer als 2 MB.");
            }

            using var reader = new StreamReader(file.OpenReadStream());
            text = await reader.ReadToEndAsync(ct);
        }
        else if (!string.IsNullOrWhiteSpace(content))
        {
            text = content;
        }
        else
        {
            return BadRequest("Bitte eine Datei hochladen oder eine Liste einfügen.");
        }

        return Ok(_import.Parse(text));
    }

    /// <summary>
    /// Legt die bestätigten Schüler an. Fehlende Klassen entstehen dabei;
    /// bereits vorhandene Namen werden übersprungen.
    /// </summary>
    [HttpPost("apply")]
    public async Task<ActionResult<StudentImportResultDto>> Apply(
        StudentImportApplyInput input,
        CancellationToken ct)
    {
        if (input.Rows.Count == 0)
        {
            return BadRequest("Es wurde keine Zeile zum Übernehmen ausgewählt.");
        }

        var uebersprungen = new List<string>();
        int neueKlassen = 0, neueSchueler = 0;

        var klassen = await _db.SchoolClasses.ToDictionaryAsync(c => c.Name, StringComparer.OrdinalIgnoreCase, ct);
        var vorhandene = await _db.Students
            .Select(s => new { s.SchoolClassId, s.FirstName, s.LastName })
            .ToListAsync(ct);

        var bekannt = new HashSet<(int, string, string)>(
            vorhandene.Select(s => (s.SchoolClassId, s.FirstName.ToLowerInvariant(), s.LastName.ToLowerInvariant())));

        foreach (var zeile in input.Rows)
        {
            var vorname = zeile.FirstName.Trim();
            var nachname = zeile.LastName.Trim();
            var klassenName = (string.IsNullOrWhiteSpace(zeile.ClassName)
                ? input.FallbackClassName ?? string.Empty
                : zeile.ClassName).Trim();

            var beschreibung = $"{nachname}, {vorname}".Trim(' ', ',');

            if (vorname.Length == 0 && nachname.Length == 0)
            {
                continue;
            }

            if (klassenName.Length == 0)
            {
                uebersprungen.Add($"{beschreibung}: keine Klasse angegeben.");
                continue;
            }

            if (!klassen.TryGetValue(klassenName, out var klasse))
            {
                klasse = new SchoolClass { Name = klassenName };
                _db.SchoolClasses.Add(klasse);
                await _db.SaveChangesAsync(ct);
                klassen[klassenName] = klasse;
                neueKlassen++;
            }

            var schluessel = (klasse.Id, vorname.ToLowerInvariant(), nachname.ToLowerInvariant());
            if (!bekannt.Add(schluessel))
            {
                uebersprungen.Add($"{beschreibung}: steht schon in {klassenName}.");
                continue;
            }

            _db.Students.Add(new Student
            {
                FirstName = vorname,
                LastName = nachname,
                SchoolClassId = klasse.Id,
            });
            neueSchueler++;
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new StudentImportResultDto(neueKlassen, neueSchueler, uebersprungen));
    }
}

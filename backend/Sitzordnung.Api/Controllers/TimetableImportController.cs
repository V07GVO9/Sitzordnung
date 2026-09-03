using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

/// <summary>
/// Übernimmt einen Stundenplan aus einem Kalenderexport (ICS), wie ihn WebUntis
/// und ähnliche Schulsysteme anbieten. Der Import läuft in zwei Schritten:
/// erst eine Vorschau zum Prüfen, dann das Übernehmen der bestätigten Zeilen.
/// </summary>
[ApiController]
[Route("api/timetable/import")]
public class TimetableImportController : ControllerBase
{
    /// <summary>Größer als jeder realistische Jahresexport.</summary>
    private const long MaxBytes = 5 * 1024 * 1024;

    private readonly AppDbContext _db;
    private readonly TimetableImportService _import;

    public TimetableImportController(AppDbContext db, TimetableImportService import)
    {
        _db = db;
        _import = import;
    }

    /// <summary>Liest den Export und zeigt, was daraus würde - ohne etwas zu speichern.</summary>
    [HttpPost("preview")]
    [RequestSizeLimit(MaxBytes + 4096)]
    public async Task<ActionResult<TimetableImportPreviewDto>> Preview(
        IFormFile? file,
        [FromForm] string? content,
        CancellationToken ct)
    {
        string ics;

        if (file is not null && file.Length > 0)
        {
            if (file.Length > MaxBytes)
            {
                return BadRequest("Die Datei ist größer als 5 MB.");
            }

            using var reader = new StreamReader(file.OpenReadStream());
            ics = await reader.ReadToEndAsync(ct);
        }
        else if (!string.IsNullOrWhiteSpace(content))
        {
            ics = content;
        }
        else
        {
            return BadRequest("Bitte eine ICS-Datei hochladen oder deren Inhalt einfügen.");
        }

        if (!ics.Contains("BEGIN:VCALENDAR", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Das sieht nicht nach einer Kalenderdatei aus. Erwartet wird eine Datei im Format ICS.");
        }

        // Was bereits angelegt ist, hilft beim Erkennen von Klasse und Fach im Titel.
        var klassen = await _db.SchoolClasses.Select(c => c.Name).ToListAsync(ct);
        var faecher = await _db.Subjects.Select(s => s.Name).ToListAsync(ct);
        var kuerzel = await _db.Subjects
            .Where(s => s.ShortName != "")
            .Select(s => s.ShortName)
            .ToListAsync(ct);

        return Ok(_import.Parse(ics, klassen, faecher.Concat(kuerzel).ToList()));
    }

    /// <summary>
    /// Übernimmt die bestätigten Zeilen. Fehlende Klassen, Fächer und Kurse
    /// werden dabei angelegt; Dopplungen und Überschneidungen übersprungen.
    /// </summary>
    [HttpPost("apply")]
    public async Task<ActionResult<TimetableImportResultDto>> Apply(
        TimetableImportApplyInput input,
        CancellationToken ct)
    {
        if (input.Entries.Count == 0)
        {
            return BadRequest("Es wurde keine Zeile zum Übernehmen ausgewählt.");
        }

        var uebersprungen = new List<string>();
        int neueKlassen = 0, neueFaecher = 0, neueKurse = 0, neueStunden = 0;

        var klassen = await _db.SchoolClasses.ToDictionaryAsync(c => c.Name, StringComparer.OrdinalIgnoreCase, ct);
        var faecher = await _db.Subjects.ToDictionaryAsync(s => s.Name, StringComparer.OrdinalIgnoreCase, ct);
        var kurse = await _db.Courses.ToListAsync(ct);
        var bestehendeStunden = await _db.TimetableEntries.ToListAsync(ct);

        foreach (var zeile in input.Entries)
        {
            var beschreibung = $"{Wochentag(zeile.DayOfWeek)} {zeile.StartTime} {zeile.SubjectName} {zeile.SchoolClassName}".Trim();

            if (!TryParseTime(zeile.StartTime, out var start) || !TryParseTime(zeile.EndTime, out var ende))
            {
                uebersprungen.Add($"{beschreibung}: unlesbare Uhrzeit.");
                continue;
            }

            if (ende <= start)
            {
                uebersprungen.Add($"{beschreibung}: das Ende liegt nicht nach dem Beginn.");
                continue;
            }

            var klassenName = zeile.SchoolClassName.Trim();
            var fachName = zeile.SubjectName.Trim();

            if (klassenName.Length == 0 || fachName.Length == 0)
            {
                uebersprungen.Add($"{beschreibung}: Klasse oder Fach fehlt.");
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

            if (!faecher.TryGetValue(fachName, out var fach))
            {
                fach = new Subject
                {
                    Name = fachName,
                    ShortName = fachName.Length <= 4 ? fachName.ToUpperInvariant() : fachName[..2].ToUpperInvariant(),
                };
                _db.Subjects.Add(fach);
                await _db.SaveChangesAsync(ct);
                faecher[fachName] = fach;
                neueFaecher++;
            }

            var kurs = kurse.FirstOrDefault(k => k.SchoolClassId == klasse.Id && k.SubjectId == fach.Id);
            if (kurs is null)
            {
                kurs = new Course { SchoolClassId = klasse.Id, SubjectId = fach.Id };
                _db.Courses.Add(kurs);
                await _db.SaveChangesAsync(ct);
                kurse.Add(kurs);
                neueKurse++;
            }

            // Dieselbe Stunde ein zweites Mal anzulegen bringt nichts.
            if (bestehendeStunden.Any(e =>
                    e.CourseId == kurs.Id && e.DayOfWeek == zeile.DayOfWeek &&
                    e.StartTime == start && e.EndTime == ende))
            {
                uebersprungen.Add($"{beschreibung}: steht schon im Stundenplan.");
                continue;
            }

            // Zwei Stunden zur selben Zeit wären im Stundenplan nicht auflösbar.
            var kollision = bestehendeStunden.FirstOrDefault(e =>
                e.DayOfWeek == zeile.DayOfWeek && start < e.EndTime && ende > e.StartTime);

            if (kollision is not null)
            {
                uebersprungen.Add(
                    $"{beschreibung}: überschneidet sich mit einer bereits eingetragenen Stunde " +
                    $"({kollision.StartTime:HH\\:mm}-{kollision.EndTime:HH\\:mm} Uhr).");
                continue;
            }

            var stunde = new TimetableEntry
            {
                CourseId = kurs.Id,
                DayOfWeek = zeile.DayOfWeek,
                StartTime = start,
                EndTime = ende,
                Room = string.IsNullOrWhiteSpace(zeile.Room) ? null : zeile.Room.Trim(),
            };

            _db.TimetableEntries.Add(stunde);
            bestehendeStunden.Add(stunde);
            neueStunden++;
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new TimetableImportResultDto(
            neueKlassen, neueFaecher, neueKurse, neueStunden, uebersprungen));
    }

    private static bool TryParseTime(string value, out TimeOnly time) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);

    private static string Wochentag(DayOfWeek tag) => tag switch
    {
        DayOfWeek.Monday => "Montag",
        DayOfWeek.Tuesday => "Dienstag",
        DayOfWeek.Wednesday => "Mittwoch",
        DayOfWeek.Thursday => "Donnerstag",
        DayOfWeek.Friday => "Freitag",
        DayOfWeek.Saturday => "Samstag",
        _ => "Sonntag",
    };
}

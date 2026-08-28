using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Services;

/// <summary>
/// Beantwortet zwei Fragen rund um den Stundenplan: welcher Unterricht gerade
/// läuft, und welcher Unterrichtsstunde eine Bewertung zugerechnet wird.
///
/// Bewertet werden darf jederzeit - auch abends nach dem Unterricht. Begrenzt
/// ist nur die Menge: je Unterrichtsstunde und Schüler eine Bewertung. Welche
/// Stunde das gerade ist, entscheidet diese Klasse.
/// </summary>
public class LessonService
{
    private readonly AppDbContext _db;
    private readonly IClock _clock;

    private static readonly CultureInfo Deutsch = CultureInfo.GetCultureInfo("de-DE");

    public LessonService(AppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    private static int ToMinutes(TimeOnly time) => time.Hour * 60 + time.Minute;

    private static string Format(TimeOnly time) => time.ToString("HH\\:mm");

    /// <summary>Läuft dieser Eintrag zum übergebenen Zeitpunkt gerade?</summary>
    private static bool LaeuftGerade(TimetableEntry entry, DateTimeOffset now)
    {
        if (entry.DayOfWeek != now.DayOfWeek)
        {
            return false;
        }

        var nowMinutes = now.Hour * 60 + now.Minute;
        return nowMinutes >= ToMinutes(entry.StartTime) && nowMinutes <= ToMinutes(entry.EndTime);
    }

    /// <summary>Liefert den Stundenplaneintrag, der gerade läuft - über alle Kurse hinweg.</summary>
    public async Task<CurrentLessonDto> GetCurrentLessonAsync(CancellationToken ct = default)
    {
        var now = _clock.Now;

        var entries = await _db.TimetableEntries
            .Include(e => e.Course).ThenInclude(c => c!.SchoolClass)
            .Include(e => e.Course).ThenInclude(c => c!.Subject)
            .Where(e => e.DayOfWeek == now.DayOfWeek)
            .ToListAsync(ct);

        var current = entries
            .Where(e => LaeuftGerade(e, now))
            .OrderBy(e => e.StartTime)
            .FirstOrDefault();

        if (current is null)
        {
            return new CurrentLessonDto(
                false, null, null, null, null, null, null,
                "Aktuell steht kein Unterricht im Stundenplan.");
        }

        return new CurrentLessonDto(
            true,
            current.CourseId,
            current.Course?.SchoolClass?.Name,
            current.Course?.Subject?.Name,
            Format(current.StartTime),
            Format(current.EndTime),
            current.Room,
            $"Laufender Unterricht: {current.Course?.Subject?.Name} in {current.Course?.SchoolClass?.Name} " +
            $"({Format(current.StartTime)}-{Format(current.EndTime)} Uhr).");
    }

    /// <summary>
    /// Ermittelt die Unterrichtsstunde, der eine Bewertung jetzt zugerechnet wird:
    /// die laufende Stunde, sonst die zuletzt vergangene. Hat der Kurs keinen
    /// Stundenplaneintrag, zählt der heutige Tag als eine Einheit.
    /// </summary>
    public async Task<LessonSlotDto> GetCurrentSlotAsync(int courseId, CancellationToken ct = default)
    {
        var now = _clock.Now;
        var heute = DateOnly.FromDateTime(now.DateTime);

        var entries = await _db.TimetableEntries
            .Where(e => e.CourseId == courseId)
            .ToListAsync(ct);

        if (entries.Count == 0)
        {
            return new LessonSlotDto(
                heute,
                "00:00",
                $"{heute.ToString("dddd, dd.MM.yyyy", Deutsch)} (kein Stundenplan hinterlegt)",
                false);
        }

        // Die laufende Stunde hat Vorrang.
        var laufend = entries.FirstOrDefault(e => LaeuftGerade(e, now));
        if (laufend is not null)
        {
            return Slot(heute, laufend, "läuft gerade");
        }

        // Sonst die jüngste Stunde, die schon vorbei ist - höchstens eine Woche zurück.
        TimetableEntry? juengste = null;
        var juengstesDatum = default(DateOnly);

        foreach (var entry in entries)
        {
            var datum = LetztesVorkommen(entry, now);
            if (juengste is null || datum > juengstesDatum ||
                (datum == juengstesDatum && entry.StartTime > juengste.StartTime))
            {
                juengste = entry;
                juengstesDatum = datum;
            }
        }

        return Slot(juengstesDatum, juengste!, juengstesDatum == heute ? "heute" : null);
    }

    /// <summary>Das letzte Datum, an dem dieser Eintrag stattgefunden hat.</summary>
    private static DateOnly LetztesVorkommen(TimetableEntry entry, DateTimeOffset now)
    {
        var heute = DateOnly.FromDateTime(now.DateTime);

        // Wie viele Tage liegt der Wochentag zurück? 0 = heute.
        var abstand = ((int)now.DayOfWeek - (int)entry.DayOfWeek + 7) % 7;

        // Heute, aber die Stunde hat noch nicht begonnen: dann zählt die Vorwoche.
        if (abstand == 0 && now.Hour * 60 + now.Minute < ToMinutes(entry.StartTime))
        {
            abstand = 7;
        }

        return heute.AddDays(-abstand);
    }

    private static LessonSlotDto Slot(DateOnly datum, TimetableEntry entry, string? zusatz)
    {
        var beschreibung =
            $"{datum.ToString("dddd, dd.MM.yyyy", Deutsch)}, {Format(entry.StartTime)}-{Format(entry.EndTime)} Uhr";

        if (zusatz is not null)
        {
            beschreibung += $" ({zusatz})";
        }

        return new LessonSlotDto(datum, Format(entry.StartTime), beschreibung, true);
    }
}

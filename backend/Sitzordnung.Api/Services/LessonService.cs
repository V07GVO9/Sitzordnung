using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Services;

/// <summary>
/// Beantwortet anhand des Stundenplans, ob gerade Unterricht stattfindet.
/// Bewertungen sind nur innerhalb einer Unterrichtsstunde (plus Toleranz) möglich.
/// </summary>
public class LessonService
{
    private readonly AppDbContext _db;
    private readonly IClock _clock;

    public LessonService(AppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<AppSettings> GetSettingsAsync(CancellationToken ct = default)
    {
        var settings = await _db.AppSettings.FirstOrDefaultAsync(s => s.Id == Models.AppSettings.SingletonId, ct);
        if (settings is null)
        {
            settings = new AppSettings { Id = Models.AppSettings.SingletonId };
            _db.AppSettings.Add(settings);
            await _db.SaveChangesAsync(ct);
        }

        return settings;
    }

    /// <summary>
    /// Prüft, ob der übergebene Zeitpunkt in den Eintrag fällt. Die Toleranz wird
    /// in Minuten seit Mitternacht gerechnet, damit sie an den Tagesrändern nicht
    /// über den Tageswechsel hinaus "umschlägt".
    /// </summary>
    private static bool Covers(TimetableEntry entry, DateTimeOffset now, int toleranceMinutes)
    {
        if (entry.DayOfWeek != now.DayOfWeek)
        {
            return false;
        }

        var nowMinutes = now.Hour * 60 + now.Minute;
        var start = Math.Max(0, ToMinutes(entry.StartTime) - toleranceMinutes);
        var end = Math.Min(24 * 60, ToMinutes(entry.EndTime) + toleranceMinutes);

        return nowMinutes >= start && nowMinutes <= end;
    }

    private static int ToMinutes(TimeOnly time) => time.Hour * 60 + time.Minute;

    private static string Format(TimeOnly time) => time.ToString("HH\\:mm");

    /// <summary>Liefert den Stundenplaneintrag, der gerade läuft - über alle Kurse hinweg.</summary>
    public async Task<CurrentLessonDto> GetCurrentLessonAsync(CancellationToken ct = default)
    {
        var settings = await GetSettingsAsync(ct);
        var now = _clock.Now;

        var entries = await _db.TimetableEntries
            .Include(e => e.Course).ThenInclude(c => c!.SchoolClass)
            .Include(e => e.Course).ThenInclude(c => c!.Subject)
            .Where(e => e.DayOfWeek == now.DayOfWeek)
            .ToListAsync(ct);

        var current = entries
            .Where(e => Covers(e, now, settings.ToleranceMinutes))
            .OrderBy(e => e.StartTime)
            .FirstOrDefault();

        if (current is null)
        {
            var message = settings.AllowRatingOutsideLesson
                ? "Aktuell steht kein Unterricht im Stundenplan. Die Notfall-Freigabe ist aktiv, Bewertungen sind trotzdem möglich."
                : "Aktuell steht kein Unterricht im Stundenplan. Bewertungen sind deshalb gesperrt.";

            return new CurrentLessonDto(false, null, null, null, null, null, null, message);
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

    /// <summary>Prüft, ob für diesen Kurs gerade bewertet werden darf.</summary>
    public async Task<RatingWindowDto> GetRatingWindowAsync(int courseId, CancellationToken ct = default)
    {
        var settings = await GetSettingsAsync(ct);
        var now = _clock.Now;

        var entries = await _db.TimetableEntries
            .Where(e => e.CourseId == courseId && e.DayOfWeek == now.DayOfWeek)
            .ToListAsync(ct);

        var match = entries
            .Where(e => Covers(e, now, settings.ToleranceMinutes))
            .OrderBy(e => e.StartTime)
            .FirstOrDefault();

        if (match is not null)
        {
            return new RatingWindowDto(
                true,
                $"Unterricht läuft ({Format(match.StartTime)}-{Format(match.EndTime)} Uhr).",
                Format(match.StartTime),
                Format(match.EndTime));
        }

        if (settings.AllowRatingOutsideLesson)
        {
            return new RatingWindowDto(
                true,
                "Kein Unterricht laut Stundenplan - Bewertung nur wegen aktiver Notfall-Freigabe möglich.",
                null,
                null);
        }

        var todaysLessons = entries.OrderBy(e => e.StartTime).ToList();
        var reason = todaysLessons.Count == 0
            ? "In diesem Kurs findet heute laut Stundenplan kein Unterricht statt."
            : "Der Unterricht in diesem Kurs läuft gerade nicht. Heute: " +
              string.Join(", ", todaysLessons.Select(e => $"{Format(e.StartTime)}-{Format(e.EndTime)}")) + " Uhr.";

        return new RatingWindowDto(false, reason, null, null);
    }
}

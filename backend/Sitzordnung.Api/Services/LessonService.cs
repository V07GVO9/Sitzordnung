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
            return await MitNavigation(
                courseId,
                new LessonSlotDto(
                    heute,
                    "00:00",
                    $"{heute.ToString("dddd, dd.MM.yyyy", Deutsch)} (kein Stundenplan hinterlegt)",
                    false),
                ct);
        }

        // Die laufende Stunde hat Vorrang.
        var laufend = entries.FirstOrDefault(e => LaeuftGerade(e, now));
        if (laufend is not null)
        {
            return await MitNavigation(courseId, Slot(heute, laufend, "läuft gerade"), ct);
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

        return await MitNavigation(
            courseId, Slot(juengstesDatum, juengste!, juengstesDatum == heute ? "heute" : null), ct);
    }

    /// <summary>
    /// Ergänzt den Anker-Slot um die Blätterangaben. Er ist immer die neueste
    /// Stunde, deshalb geht es von hier aus nur zurück.
    /// </summary>
    private async Task<LessonSlotDto> MitNavigation(int courseId, LessonSlotDto slot, CancellationToken ct)
    {
        var start = TimeOnly.ParseExact(slot.StartTime, "HH:mm", CultureInfo.InvariantCulture);
        var zurueck = await FindNeighbourAsync(courseId, slot.Date, start, -1, ct);

        return slot with { HasPrevious = zurueck is not null, HasNext = false, IsCurrent = true };
    }

    /// <summary>
    /// Blättert von einer Unterrichtsstunde zur vorherigen oder nächsten desselben
    /// Kurses. So lässt sich der Stand früherer Stunden ansehen und nachträglich
    /// bewerten. Vorwärts geht es höchstens bis zur aktuellen Stunde.
    /// </summary>
    public async Task<LessonSlotDto?> GetNeighbourSlotAsync(
        int courseId, DateOnly date, TimeOnly start, int direction, CancellationToken ct = default)
    {
        var nachbar = await FindNeighbourAsync(courseId, date, start, direction, ct);
        return nachbar is null ? null : await DescribeAsync(courseId, nachbar.Value, ct);
    }

    /// <summary>Beschreibt eine bestimmte Unterrichtsstunde - etwa nach dem Blättern.</summary>
    public async Task<LessonSlotDto> GetSlotAsync(
        int courseId, DateOnly date, TimeOnly start, CancellationToken ct = default)
        => await DescribeAsync(courseId, (date, start), ct);

    /// <summary>
    /// Sucht die nächstgelegene Unterrichtsstunde in die gewünschte Richtung.
    /// Berücksichtigt werden die Stundenplaneinträge des Kurses und zusätzlich
    /// Stunden, für die bereits Bewertungen vorliegen - so bleiben auch Stunden
    /// aus einem früheren Stundenplan erreichbar.
    /// </summary>
    private async Task<(DateOnly Date, TimeOnly Start)?> FindNeighbourAsync(
        int courseId, DateOnly date, TimeOnly start, int direction, CancellationToken ct)
    {
        var rueckwaerts = direction < 0;
        var anker = (Date: date, Start: start);

        var entries = await _db.TimetableEntries
            .Where(e => e.CourseId == courseId)
            .ToListAsync(ct);

        var kandidaten = new List<(DateOnly Date, TimeOnly Start)>();

        foreach (var entry in entries)
        {
            var treffer = NachbarImWochenraster(entry, anker, rueckwaerts);
            if (treffer is not null)
            {
                kandidaten.Add(treffer.Value);
            }
        }

        // Stunden mit Bewertungen, die (nicht mehr) im Stundenplan stehen.
        var bewertete = await _db.Ratings
            .Where(r => r.CourseId == courseId)
            .Select(r => new { r.LessonDate, r.LessonStart })
            .Distinct()
            .ToListAsync(ct);

        foreach (var eintrag in bewertete)
        {
            var kandidat = (eintrag.LessonDate, eintrag.LessonStart);
            if (Vergleiche(kandidat, anker) * (rueckwaerts ? -1 : 1) > 0)
            {
                kandidaten.Add(kandidat);
            }
        }

        if (kandidaten.Count == 0)
        {
            return null;
        }

        var ziel = rueckwaerts
            ? kandidaten.OrderByDescending(k => k.Date).ThenByDescending(k => k.Start).First()
            : kandidaten.OrderBy(k => k.Date).ThenBy(k => k.Start).First();

        // Rückwärts nicht endlos: zwei Jahre reichen für jedes Schuljahr.
        var heute = DateOnly.FromDateTime(_clock.Now.DateTime);
        if (rueckwaerts && ziel.Date < heute.AddYears(-2))
        {
            return null;
        }

        // Vorwärts höchstens bis zur Stunde, die jetzt zählt.
        if (!rueckwaerts)
        {
            var aktuell = await GetCurrentSlotAsync(courseId, ct);
            var grenze = (aktuell.Date, TimeOnly.ParseExact(aktuell.StartTime, "HH:mm", CultureInfo.InvariantCulture));
            if (Vergleiche(ziel, grenze) > 0)
            {
                return null;
            }
        }

        return ziel;
    }

    /// <summary>
    /// Das nächste bzw. vorherige Vorkommen eines wöchentlichen Stundenplaneintrags,
    /// gemessen an der übergebenen Stunde.
    /// </summary>
    private static (DateOnly Date, TimeOnly Start)? NachbarImWochenraster(
        TimetableEntry entry, (DateOnly Date, TimeOnly Start) anker, bool rueckwaerts)
    {
        if (rueckwaerts)
        {
            // Letztes Vorkommen an oder vor dem Ankerdatum ...
            var abstand = ((int)anker.Date.DayOfWeek - (int)entry.DayOfWeek + 7) % 7;
            var datum = anker.Date.AddDays(-abstand);

            // ... aber echt vor der Ankerstunde.
            if (Vergleiche((datum, entry.StartTime), anker) >= 0)
            {
                datum = datum.AddDays(-7);
            }

            return (datum, entry.StartTime);
        }

        var vorlauf = ((int)entry.DayOfWeek - (int)anker.Date.DayOfWeek + 7) % 7;
        var naechstes = anker.Date.AddDays(vorlauf);

        if (Vergleiche((naechstes, entry.StartTime), anker) <= 0)
        {
            naechstes = naechstes.AddDays(7);
        }

        return (naechstes, entry.StartTime);
    }

    private static int Vergleiche((DateOnly Date, TimeOnly Start) a, (DateOnly Date, TimeOnly Start) b)
        => a.Date != b.Date ? a.Date.CompareTo(b.Date) : a.Start.CompareTo(b.Start);

    /// <summary>Baut die Beschreibung einer Stunde samt Hinweis, wohin geblättert werden kann.</summary>
    private async Task<LessonSlotDto> DescribeAsync(
        int courseId, (DateOnly Date, TimeOnly Start) stunde, CancellationToken ct)
    {
        var entries = await _db.TimetableEntries
            .Where(e => e.CourseId == courseId)
            .ToListAsync(ct);

        var passend = entries.FirstOrDefault(
            e => e.DayOfWeek == stunde.Date.DayOfWeek && e.StartTime == stunde.Start);

        var aktuell = await GetCurrentSlotAsync(courseId, ct);
        var aktuellStart = TimeOnly.ParseExact(aktuell.StartTime, "HH:mm", CultureInfo.InvariantCulture);
        var istAktuell = aktuell.Date == stunde.Date && aktuellStart == stunde.Start;

        var heute = DateOnly.FromDateTime(_clock.Now.DateTime);
        string? zusatz = null;

        if (passend is not null && LaeuftGerade(passend, _clock.Now) && stunde.Date == heute)
        {
            zusatz = "läuft gerade";
        }
        else if (stunde.Date == heute)
        {
            zusatz = "heute";
        }

        var beschreibung = $"{stunde.Date.ToString("dddd, dd.MM.yyyy", Deutsch)}, {Format(stunde.Start)}";
        beschreibung += passend is not null ? $"-{Format(passend.EndTime)} Uhr" : " Uhr";

        if (entries.Count == 0)
        {
            beschreibung = $"{stunde.Date.ToString("dddd, dd.MM.yyyy", Deutsch)} (kein Stundenplan hinterlegt)";
        }

        if (zusatz is not null && entries.Count > 0)
        {
            beschreibung += $" ({zusatz})";
        }

        return new LessonSlotDto(
            stunde.Date,
            Format(stunde.Start),
            beschreibung,
            entries.Count > 0,
            await FindNeighbourAsync(courseId, stunde.Date, stunde.Start, -1, ct) is not null,
            !istAktuell && await FindNeighbourAsync(courseId, stunde.Date, stunde.Start, 1, ct) is not null,
            istAktuell);
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

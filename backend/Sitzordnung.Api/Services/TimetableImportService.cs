using Ical.Net;
using Ical.Net.CalendarComponents;
using Ical.Net.DataTypes;
using Sitzordnung.Api.Dtos;

namespace Sitzordnung.Api.Services;

/// <summary>
/// Liest einen Stundenplan aus einer ICS-Datei, wie WebUntis und andere
/// Schulsysteme sie exportieren, und macht daraus Wochenmuster.
///
/// Ein solcher Export enthält einzelne Termine für jede Woche des Schuljahres.
/// Für den Stundenplan interessiert nur das Muster dahinter: welcher Unterricht
/// an welchem Wochentag von wann bis wann stattfindet.
/// </summary>
public class TimetableImportService
{
    /// <summary>Ein Muster, das seltener vorkommt, ist vermutlich eine Vertretung.</summary>
    private const int MindestensSoOftFuerRegelunterricht = 2;

    private readonly ILogger<TimetableImportService> _logger;

    public TimetableImportService(ILogger<TimetableImportService> logger)
    {
        _logger = logger;
    }

    /// <summary>Ein erkanntes Wochenmuster vor dem Zuordnen zu Klasse und Fach.</summary>
    private sealed record Muster(DayOfWeek Day, TimeOnly Start, TimeOnly End, string Titel, string? Raum);

    public TimetableImportPreviewDto Parse(
        string icsInhalt,
        IReadOnlyCollection<string> bekannteKlassen,
        IReadOnlyCollection<string> bekannteFaecher,
        string zeitzone = "Europe/Berlin")
    {
        var warnungen = new List<string>();

        Calendar kalender;
        try
        {
            kalender = Calendar.Load(icsInhalt);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Die ICS-Datei konnte nicht gelesen werden.");
            return new TimetableImportPreviewDto(
                Array.Empty<TimetableImportRowDto>(),
                new[] { "Die Datei ließ sich nicht als Kalender lesen. Stammt sie wirklich aus dem Stundenplan-Export?" });
        }

        var zone = FindeZeitzone(zeitzone, warnungen);

        // Jeder Termin wird auf sein Wochenmuster reduziert und gezählt.
        var zaehler = new Dictionary<Muster, int>();
        var uebersprungen = 0;

        foreach (var termin in kalender.Events)
        {
            foreach (var muster in MusterAus(termin, zone))
            {
                if (muster is null)
                {
                    uebersprungen++;
                    continue;
                }

                zaehler[muster] = zaehler.GetValueOrDefault(muster) + 1;
            }
        }

        if (uebersprungen > 0)
        {
            warnungen.Add($"{uebersprungen} Termine ohne verwertbare Uhrzeit wurden übersprungen.");
        }

        if (zaehler.Count == 0)
        {
            warnungen.Add("Die Datei enthält keine Termine mit Uhrzeit.");
        }

        var zeilen = zaehler
            .Select(eintrag =>
            {
                var (klasse, fach) = ZerlegeTitel(eintrag.Key.Titel, bekannteKlassen, bekannteFaecher);

                return new TimetableImportRowDto(
                    eintrag.Key.Day,
                    eintrag.Key.Start.ToString("HH\\:mm"),
                    eintrag.Key.End.ToString("HH\\:mm"),
                    klasse,
                    fach,
                    eintrag.Key.Raum,
                    eintrag.Value,
                    eintrag.Value >= MindestensSoOftFuerRegelunterricht,
                    eintrag.Key.Titel);
            })
            .OrderBy(z => z.DayOfWeek)
            .ThenBy(z => z.StartTime)
            .ThenBy(z => z.SchoolClassName)
            .ToList();

        var einzelne = zeilen.Count(z => !z.LooksRegular);
        if (einzelne > 0)
        {
            warnungen.Add(
                $"{einzelne} Einträge kommen nur einmal vor - vermutlich Vertretungen oder Einzeltermine. " +
                "Sie sind vorausgewählt abgewählt, lassen sich aber übernehmen.");
        }

        var ohneZuordnung = zeilen.Count(z => string.IsNullOrWhiteSpace(z.SchoolClassName) || string.IsNullOrWhiteSpace(z.SubjectName));
        if (ohneZuordnung > 0)
        {
            warnungen.Add(
                $"Bei {ohneZuordnung} Einträgen war aus dem Titel nicht sicher erkennbar, was Klasse und was Fach ist. " +
                "Bitte in der Vorschau ergänzen.");
        }

        return new TimetableImportPreviewDto(zeilen, warnungen);
    }

    private static TimeZoneInfo FindeZeitzone(string id, List<string> warnungen)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception)
        {
            warnungen.Add($"Die Zeitzone '{id}' ist unbekannt, es wird die Zeitzone des Servers verwendet.");
            return TimeZoneInfo.Local;
        }
    }

    /// <summary>
    /// Macht aus einem Termin sein Wochenmuster. Wiederkehrende Termine (RRULE)
    /// liefern mehrere - für das Muster zählt aber nur der erste, weil sich
    /// Wochentag und Uhrzeit dabei nicht ändern; die Anzahl kommt aus der Zählung.
    /// </summary>
    private IEnumerable<Muster?> MusterAus(CalendarEvent termin, TimeZoneInfo zone)
    {
        if (termin.DtStart is null || termin.DtEnd is null || termin.IsAllDay)
        {
            yield return null;
            yield break;
        }

        var start = NachLokal(termin.DtStart, zone);
        var ende = NachLokal(termin.DtEnd, zone);

        if (ende <= start)
        {
            yield return null;
            yield break;
        }

        var titel = (termin.Summary ?? string.Empty).Trim();
        var raum = (termin.Location ?? string.Empty).Trim();

        var muster = new Muster(
            start.DayOfWeek,
            TimeOnly.FromDateTime(start),
            TimeOnly.FromDateTime(ende),
            titel,
            string.IsNullOrWhiteSpace(raum) ? null : raum);

        // Eine Wochenregel steht für viele Termine; das schlägt sich in der Zählung nieder.
        var wiederholungen = termin.RecurrenceRules?.Count > 0 ? ZaehleWochen(termin) : 1;

        for (var i = 0; i < wiederholungen; i++)
        {
            yield return muster;
        }
    }

    /// <summary>Wie oft wiederholt sich eine Wochenregel? Ohne Ende wird ein Schulhalbjahr angenommen.</summary>
    private static int ZaehleWochen(CalendarEvent termin)
    {
        var regel = termin.RecurrenceRules.First();

        if (regel.Count > 0)
        {
            return regel.Count;
        }

        if (regel.Until != default && termin.DtStart is not null)
        {
            var wochen = (regel.Until - termin.DtStart.Value).TotalDays / 7;
            return Math.Max(1, (int)Math.Round(wochen));
        }

        return 20;
    }

    private static DateTime NachLokal(IDateTime wert, TimeZoneInfo zone)
    {
        // Zeiten mit "Z" oder mit Zeitzonenangabe werden umgerechnet, Zeiten ohne
        // Angabe gelten laut Norm als Ortszeit und bleiben, wie sie sind.
        if (wert.IsUtc)
        {
            return TimeZoneInfo.ConvertTimeFromUtc(wert.AsUtc, zone);
        }

        if (!string.IsNullOrEmpty(wert.TzId))
        {
            return TimeZoneInfo.ConvertTimeFromUtc(wert.AsUtc, zone);
        }

        return wert.Value;
    }

    /// <summary>
    /// Zerlegt einen Termintitel in Klasse und Fach. Die Formate unterscheiden
    /// sich je nach Schule ("MA - 10a - A101", "Deutsch KDM23", "10a/D"), deshalb
    /// hilft vor allem der Abgleich mit dem, was schon in der App angelegt ist.
    /// Bleibt etwas unklar, wird es leer gelassen und in der Vorschau ergänzt.
    /// </summary>
    public static (string SchoolClass, string Subject) ZerlegeTitel(
        string titel,
        IReadOnlyCollection<string> bekannteKlassen,
        IReadOnlyCollection<string> bekannteFaecher)
    {
        if (string.IsNullOrWhiteSpace(titel))
        {
            return (string.Empty, string.Empty);
        }

        var teile = titel
            .Split(new[] { '-', '/', '|', ',', ';', '\t' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .SelectMany(t => t.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .ToList();

        var klasse = teile.FirstOrDefault(t => bekannteKlassen.Contains(t, StringComparer.OrdinalIgnoreCase));
        var fach = teile.FirstOrDefault(t => bekannteFaecher.Contains(t, StringComparer.OrdinalIgnoreCase));

        var uebrig = teile
            .Where(t => !string.Equals(t, klasse, StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(t, fach, StringComparison.OrdinalIgnoreCase))
            .ToList();

        // Klassenbezeichnungen enthalten fast immer eine Ziffer ("10a", "KDM23"),
        // Fachbezeichnungen so gut wie nie.
        klasse ??= uebrig.FirstOrDefault(t => t.Any(char.IsDigit));
        if (klasse is not null)
        {
            uebrig.Remove(klasse);
        }

        fach ??= uebrig.FirstOrDefault(t => t.Any(char.IsLetter) && !t.Any(char.IsDigit));

        return (klasse ?? string.Empty, fach ?? string.Empty);
    }
}

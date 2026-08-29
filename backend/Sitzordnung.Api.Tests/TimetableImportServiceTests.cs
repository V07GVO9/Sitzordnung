using Microsoft.Extensions.Logging.Abstractions;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Tests;

/// <summary>
/// Der Kalenderexport aus WebUntis enthält Einzeltermine für jede Woche. Diese
/// Tests prüfen, dass daraus die richtigen Wochenmuster werden - und vor allem,
/// dass die Uhrzeiten stimmen. Ein Export in UTC ist die häufigste Fehlerquelle.
/// </summary>
public class TimetableImportServiceTests
{
    private static TimetableImportService Service() =>
        new(NullLogger<TimetableImportService>.Instance);

    private static readonly string[] KeineKlassen = Array.Empty<string>();
    private static readonly string[] KeineFaecher = Array.Empty<string>();

    private static string Kalender(params string[] termine) =>
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Untis//DE\r\n"
        + string.Join("\r\n", termine)
        + "\r\nEND:VCALENDAR\r\n";

    /// <summary>DTSTART/DTEND in UTC, so exportiert WebUntis üblicherweise.</summary>
    private static string TerminUtc(string datum, string vonUtc, string bisUtc, string titel, string? raum = null)
    {
        var raumZeile = raum is null ? string.Empty : $"\r\nLOCATION:{raum}";
        return $"BEGIN:VEVENT\r\nUID:{Guid.NewGuid()}\r\nDTSTART:{datum}T{vonUtc}00Z\r\n" +
               $"DTEND:{datum}T{bisUtc}00Z\r\nSUMMARY:{titel}{raumZeile}\r\nEND:VEVENT";
    }

    [Fact]
    public void Eine_woechentliche_Stunde_wird_als_Muster_erkannt()
    {
        // Drei Mittwoche hintereinander, jeweils 08:00-09:30 Ortszeit
        // (im Sommer entspricht das 06:00-07:30 UTC).
        var ics = Kalender(
            TerminUtc("20250903", "0600", "0730", "D - KDM23", "A101"),
            TerminUtc("20250910", "0600", "0730", "D - KDM23", "A101"),
            TerminUtc("20250917", "0600", "0730", "D - KDM23", "A101"));

        var vorschau = Service().Parse(ics, KeineKlassen, KeineFaecher);

        var zeile = Assert.Single(vorschau.Rows);
        Assert.Equal(DayOfWeek.Wednesday, zeile.DayOfWeek);
        Assert.Equal("08:00", zeile.StartTime);
        Assert.Equal("09:30", zeile.EndTime);
        Assert.Equal("A101", zeile.Room);
        Assert.Equal(3, zeile.Occurrences);
        Assert.True(zeile.LooksRegular);
    }

    [Fact]
    public void Winterzeit_wird_richtig_umgerechnet()
    {
        // Im Januar gilt MEZ: 07:00 UTC sind 08:00 Ortszeit.
        var ics = Kalender(
            TerminUtc("20260112", "0700", "0745", "MA 10a"),
            TerminUtc("20260119", "0700", "0745", "MA 10a"));

        var zeile = Assert.Single(Service().Parse(ics, KeineKlassen, KeineFaecher).Rows);

        Assert.Equal("08:00", zeile.StartTime);
        Assert.Equal(DayOfWeek.Monday, zeile.DayOfWeek);
    }

    [Fact]
    public void Sommerzeit_wird_richtig_umgerechnet()
    {
        // Im Juni gilt MESZ: 07:00 UTC sind 09:00 Ortszeit.
        var ics = Kalender(
            TerminUtc("20260601", "0700", "0745", "MA 10a"),
            TerminUtc("20260608", "0700", "0745", "MA 10a"));

        var zeile = Assert.Single(Service().Parse(ics, KeineKlassen, KeineFaecher).Rows);

        Assert.Equal("09:00", zeile.StartTime);
    }

    [Fact]
    public void Verschiedene_Stunden_werden_getrennt_gezaehlt()
    {
        var ics = Kalender(
            TerminUtc("20250903", "0600", "0730", "D - KDM23"),
            TerminUtc("20250910", "0600", "0730", "D - KDM23"),
            TerminUtc("20250904", "0800", "0930", "MA - 10a"),
            TerminUtc("20250911", "0800", "0930", "MA - 10a"));

        var vorschau = Service().Parse(ics, KeineKlassen, KeineFaecher);

        Assert.Equal(2, vorschau.Rows.Count);
        Assert.All(vorschau.Rows, z => Assert.Equal(2, z.Occurrences));
        Assert.Contains(vorschau.Rows, z => z.DayOfWeek == DayOfWeek.Wednesday);
        Assert.Contains(vorschau.Rows, z => z.DayOfWeek == DayOfWeek.Thursday);
    }

    [Fact]
    public void Ein_einzelner_Termin_gilt_nicht_als_Regelunterricht()
    {
        var ics = Kalender(TerminUtc("20250903", "0600", "0730", "Vertretung - 10a"));

        var zeile = Assert.Single(Service().Parse(ics, KeineKlassen, KeineFaecher).Rows);

        Assert.Equal(1, zeile.Occurrences);
        Assert.False(zeile.LooksRegular);
    }

    [Fact]
    public void Ganztagstermine_werden_uebersprungen()
    {
        var ics = Kalender(
            "BEGIN:VEVENT\r\nUID:1\r\nDTSTART;VALUE=DATE:20250903\r\n" +
            "DTEND;VALUE=DATE:20250904\r\nSUMMARY:Wandertag\r\nEND:VEVENT");

        var vorschau = Service().Parse(ics, KeineKlassen, KeineFaecher);

        Assert.Empty(vorschau.Rows);
        Assert.Contains(vorschau.Warnings, w => w.Contains("übersprungen"));
    }

    [Fact]
    public void Eine_Wochenregel_zaehlt_als_viele_Termine()
    {
        var ics = Kalender(
            "BEGIN:VEVENT\r\nUID:1\r\nDTSTART:20250903T060000Z\r\nDTEND:20250903T073000Z\r\n" +
            "RRULE:FREQ=WEEKLY;COUNT=12\r\nSUMMARY:D - KDM23\r\nEND:VEVENT");

        var zeile = Assert.Single(Service().Parse(ics, KeineKlassen, KeineFaecher).Rows);

        Assert.Equal(12, zeile.Occurrences);
        Assert.True(zeile.LooksRegular);
    }

    [Fact]
    public void Eine_kaputte_Datei_fuehrt_nicht_zum_Absturz()
    {
        var vorschau = Service().Parse("das ist kein Kalender", KeineKlassen, KeineFaecher);

        Assert.Empty(vorschau.Rows);
        Assert.NotEmpty(vorschau.Warnings);
    }

    // --- Zerlegen des Titels ---

    [Theory]
    [InlineData("D - KDM23", "KDM23", "D")]
    [InlineData("KDM23 - D", "KDM23", "D")]
    [InlineData("MA - 10a - A101", "10a", "MA")]
    [InlineData("Deutsch, KDM23", "KDM23", "Deutsch")]
    [InlineData("10a/Mathematik", "10a", "Mathematik")]
    public void Klasse_und_Fach_werden_aus_dem_Titel_erkannt(string titel, string klasse, string fach)
    {
        var (erkannteKlasse, erkanntesFach) =
            TimetableImportService.ZerlegeTitel(titel, KeineKlassen, KeineFaecher);

        Assert.Equal(klasse, erkannteKlasse);
        Assert.Equal(fach, erkanntesFach);
    }

    [Fact]
    public void Bereits_angelegte_Klassen_und_Faecher_haben_Vorrang()
    {
        // "BFI24" enthält Ziffern und "Politik" nicht - hier hilft die Heuristik.
        // Umgekehrt wäre "Info 2" ohne Vorwissen nicht eindeutig.
        var (klasse, fach) = TimetableImportService.ZerlegeTitel(
            "Info 2 BFI24",
            bekannteKlassen: new[] { "BFI24" },
            bekannteFaecher: new[] { "Info 2", "Info" });

        Assert.Equal("BFI24", klasse);
        Assert.Equal("Info", fach);
    }

    [Fact]
    public void Ein_unklarer_Titel_bleibt_leer_statt_zu_raten()
    {
        var (klasse, fach) = TimetableImportService.ZerlegeTitel("", KeineKlassen, KeineFaecher);

        Assert.Equal(string.Empty, klasse);
        Assert.Equal(string.Empty, fach);
    }

    [Fact]
    public void Bei_unklaren_Zuordnungen_warnt_die_Vorschau()
    {
        var ics = Kalender(
            TerminUtc("20250903", "0600", "0730", "Besprechung"),
            TerminUtc("20250910", "0600", "0730", "Besprechung"));

        var vorschau = Service().Parse(ics, KeineKlassen, KeineFaecher);

        Assert.Contains(vorschau.Warnings, w => w.Contains("Klasse und was Fach"));
    }
}

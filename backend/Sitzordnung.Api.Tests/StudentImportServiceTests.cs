using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Tests;

/// <summary>
/// Schülerlisten kommen als CSV aus WebUntis oder werden aus einer Tabelle
/// eingefügt. Die Spaltennamen und Trennzeichen sind je nach Schule anders,
/// deshalb prüfen diese Tests die gängigen Varianten.
/// </summary>
public class StudentImportServiceTests
{
    private static StudentImportService Service() => new();

    [Fact]
    public void Ein_Export_mit_Semikolon_wird_gelesen()
    {
        var csv = string.Join("\r\n",
            "Klasse;Langname;Vorname;Geburtsdatum",
            "BFI24;Berger;Anna;01.02.2008",
            "BFI24;Cordes;Ben;15.07.2007");

        var vorschau = Service().Parse(csv);

        Assert.Equal(2, vorschau.Rows.Count);
        Assert.Equal("Anna", vorschau.Rows[0].FirstName);
        Assert.Equal("Berger", vorschau.Rows[0].LastName);
        Assert.Equal("BFI24", vorschau.Rows[0].ClassName);
    }

    [Fact]
    public void Auch_Nachname_als_Spaltenname_wird_erkannt()
    {
        var csv = "Nachname,Vorname,Klasse\nDorn,Clara,10a";

        var zeile = Assert.Single(Service().Parse(csv).Rows);

        Assert.Equal("Clara", zeile.FirstName);
        Assert.Equal("Dorn", zeile.LastName);
        Assert.Equal("10a", zeile.ClassName);
    }

    [Fact]
    public void Tabulatoren_aus_einer_Tabellenkalkulation_funktionieren()
    {
        var text = "Langname\tVorname\tKlasse\nEbert\tDavid\tKDM23";

        var zeile = Assert.Single(Service().Parse(text).Rows);

        Assert.Equal("David", zeile.FirstName);
        Assert.Equal("KDM23", zeile.ClassName);
    }

    [Fact]
    public void Die_Reihenfolge_der_Spalten_ist_egal()
    {
        var csv = "Vorname;Klasse;Langname\nEmma;BFI24;Fuchs";

        var zeile = Assert.Single(Service().Parse(csv).Rows);

        Assert.Equal("Emma", zeile.FirstName);
        Assert.Equal("Fuchs", zeile.LastName);
        Assert.Equal("BFI24", zeile.ClassName);
    }

    [Fact]
    public void Ein_BOM_am_Dateianfang_stoert_nicht()
    {
        var csv = "﻿Klasse;Langname;Vorname\nBFI24;Grau;Felix";

        var zeile = Assert.Single(Service().Parse(csv).Rows);

        Assert.Equal("Felix", zeile.FirstName);
        Assert.Equal("BFI24", zeile.ClassName);
    }

    [Fact]
    public void Felder_in_Anfuehrungszeichen_werden_zusammengehalten()
    {
        var csv = "Langname;Vorname;Klasse\n\"von Hohenstein\";\"Anna-Lena\";\"10a\"";

        var zeile = Assert.Single(Service().Parse(csv).Rows);

        Assert.Equal("von Hohenstein", zeile.LastName);
        Assert.Equal("Anna-Lena", zeile.FirstName);
    }

    [Fact]
    public void Ohne_Klassenspalte_bleibt_die_Klasse_leer_und_es_wird_gewarnt()
    {
        var csv = "Langname;Vorname\nBerger;Anna";

        var vorschau = Service().Parse(csv);

        Assert.Equal(string.Empty, vorschau.Rows[0].ClassName);
        Assert.Contains(vorschau.Warnings, w => w.Contains("keine Klassenspalte"));
    }

    // --- Eingefügte Listen ohne Kopfzeile ---

    [Fact]
    public void Eine_Liste_Nachname_Komma_Vorname_wird_gelesen()
    {
        var text = "Berger, Anna\nCordes, Ben";

        var vorschau = Service().Parse(text);

        Assert.Equal(2, vorschau.Rows.Count);
        Assert.Equal("Berger", vorschau.Rows[0].LastName);
        Assert.Equal("Anna", vorschau.Rows[0].FirstName);
        Assert.Contains(vorschau.Warnings, w => w.Contains("keine Kopfzeile"));
    }

    [Fact]
    public void Eine_Liste_Vorname_Nachname_wird_gelesen()
    {
        var vorschau = Service().Parse("Clara Dorn\nDavid Ebert");

        Assert.Equal("Clara", vorschau.Rows[0].FirstName);
        Assert.Equal("Dorn", vorschau.Rows[0].LastName);
        Assert.Equal("Ebert", vorschau.Rows[1].LastName);
    }

    [Fact]
    public void Ein_dreiteiliger_Name_behaelt_den_Vornamen_zusammen()
    {
        var zeile = Assert.Single(Service().Parse("Anna Lena Berger").Rows);

        Assert.Equal("Anna Lena", zeile.FirstName);
        Assert.Equal("Berger", zeile.LastName);
    }

    // --- Randfälle ---

    [Fact]
    public void Leerzeilen_werden_uebersprungen()
    {
        var csv = "Langname;Vorname;Klasse\nBerger;Anna;10a\n\n\nCordes;Ben;10a\n";

        Assert.Equal(2, Service().Parse(csv).Rows.Count);
    }

    [Fact]
    public void Eine_leere_Datei_liefert_eine_Warnung()
    {
        var vorschau = Service().Parse("   \n  \n");

        Assert.Empty(vorschau.Rows);
        Assert.NotEmpty(vorschau.Warnings);
    }

    [Fact]
    public void Doppelte_Namen_werden_gemeldet()
    {
        var csv = "Langname;Vorname;Klasse\nBerger;Anna;10a\nBerger;Anna;10a";

        var vorschau = Service().Parse(csv);

        Assert.Contains(vorschau.Warnings, w => w.Contains("mehrfach"));
    }

    [Fact]
    public void Fehlende_Vornamen_werden_gemeldet()
    {
        var csv = "Langname;Vorname;Klasse\nBerger;;10a";

        var vorschau = Service().Parse(csv);

        Assert.Single(vorschau.Rows);
        Assert.Contains(vorschau.Warnings, w => w.Contains("fehlt der Vor- oder Nachname"));
    }
}

using System.Text;
using Sitzordnung.Api.Dtos;

namespace Sitzordnung.Api.Services;

/// <summary>
/// Liest Schülerlisten aus einer Tabelle, wie WebUntis und andere Schulsysteme
/// sie exportieren (CSV oder als Text eingefügt).
///
/// Die Spaltennamen unterscheiden sich je nach System und Einstellung, deshalb
/// werden sie aus der Kopfzeile erschlossen. Fehlt eine Kopfzeile, gilt die
/// verbreitete Schreibweise "Nachname, Vorname" je Zeile.
/// </summary>
public class StudentImportService
{
    private static readonly char[] MoeglicheTrenner = { ';', '\t', ',' };

    private static readonly string[] NachnameSpalten =
        { "nachname", "langname", "familienname", "name", "schueler", "schüler" };

    private static readonly string[] VornameSpalten = { "vorname", "rufname", "erstername" };

    private static readonly string[] KlasseSpalten = { "klasse", "klassen", "klassenname" };

    public StudentImportPreviewDto Parse(string inhalt)
    {
        var warnungen = new List<string>();

        var zeilen = inhalt
            .Replace("\r\n", "\n")
            .Split('\n')
            .Select(z => z.TrimEnd())
            .Where(z => z.Trim().Length > 0)
            .ToList();

        if (zeilen.Count == 0)
        {
            return new StudentImportPreviewDto(
                Array.Empty<StudentImportRowDto>(),
                new[] { "Die Datei enthält keine Zeilen." });
        }

        // Ein möglicher BOM am Dateianfang stört den Vergleich der Kopfzeile.
        zeilen[0] = zeilen[0].TrimStart('﻿');

        var trenner = ErkenneTrenner(zeilen[0]);
        var kopf = ZerlegeZeile(zeilen[0], trenner);
        var spalten = ErkenneSpalten(kopf);

        var datenzeilen = spalten.HatKopfzeile ? zeilen.Skip(1) : zeilen;

        if (!spalten.HatKopfzeile)
        {
            warnungen.Add(
                "Es wurde keine Kopfzeile erkannt. Die Zeilen werden als \"Nachname, Vorname\" gelesen.");
        }

        var ergebnis = new List<StudentImportRowDto>();
        var unvollstaendig = 0;

        foreach (var zeile in datenzeilen)
        {
            var felder = ZerlegeZeile(zeile, trenner);

            var nachname = Feld(felder, spalten.Nachname);
            var vorname = Feld(felder, spalten.Vorname);
            var klasse = Feld(felder, spalten.Klasse);

            if (!spalten.HatKopfzeile)
            {
                // Ohne Kopfzeile: erstes Feld Nachname, zweites Vorname.
                nachname = Feld(felder, 0);
                vorname = Feld(felder, 1);

                // "Vorname Nachname" in einem einzigen Feld.
                if (vorname.Length == 0 && nachname.Contains(' '))
                {
                    var teile = nachname.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    nachname = teile[^1];
                    vorname = string.Join(' ', teile[..^1]);
                }
            }

            if (nachname.Length == 0 && vorname.Length == 0)
            {
                continue;
            }

            if (nachname.Length == 0 || vorname.Length == 0)
            {
                unvollstaendig++;
            }

            ergebnis.Add(new StudentImportRowDto(vorname, nachname, klasse));
        }

        if (ergebnis.Count == 0)
        {
            warnungen.Add("Aus der Datei ließen sich keine Namen lesen.");
        }

        if (unvollstaendig > 0)
        {
            warnungen.Add($"Bei {unvollstaendig} Zeilen fehlt der Vor- oder Nachname.");
        }

        // Doppelte Namen deuten meist darauf hin, dass eine Datei zweimal enthalten ist.
        var doppelt = ergebnis
            .GroupBy(r => (r.FirstName.ToLowerInvariant(), r.LastName.ToLowerInvariant(), r.ClassName.ToLowerInvariant()))
            .Count(g => g.Count() > 1);

        if (doppelt > 0)
        {
            warnungen.Add($"{doppelt} Namen kommen mehrfach vor.");
        }

        if (spalten.HatKopfzeile && spalten.Klasse < 0)
        {
            warnungen.Add("Die Datei enthält keine Klassenspalte - bitte unten eine Klasse auswählen.");
        }

        return new StudentImportPreviewDto(ergebnis, warnungen);
    }

    private static string Feld(IReadOnlyList<string> felder, int index) =>
        index >= 0 && index < felder.Count ? felder[index].Trim() : string.Empty;

    /// <summary>Nimmt das Zeichen, das in der Kopfzeile am häufigsten vorkommt.</summary>
    private static char ErkenneTrenner(string kopfzeile)
    {
        var bester = ';';
        var meiste = 0;

        foreach (var kandidat in MoeglicheTrenner)
        {
            var anzahl = kopfzeile.Count(c => c == kandidat);
            if (anzahl > meiste)
            {
                meiste = anzahl;
                bester = kandidat;
            }
        }

        return bester;
    }

    private sealed record Spalten(int Nachname, int Vorname, int Klasse, bool HatKopfzeile);

    private static Spalten ErkenneSpalten(IReadOnlyList<string> kopf)
    {
        var normalisiert = kopf
            .Select(k => k.Trim().Trim('"').ToLowerInvariant())
            .ToList();

        var nachname = normalisiert.FindIndex(k => NachnameSpalten.Contains(k));
        var vorname = normalisiert.FindIndex(k => VornameSpalten.Contains(k));
        var klasse = normalisiert.FindIndex(k => KlasseSpalten.Contains(k));

        // Eine Kopfzeile ist es nur, wenn beide Namensspalten benannt sind.
        var hatKopfzeile = nachname >= 0 && vorname >= 0;

        return new Spalten(nachname, vorname, klasse, hatKopfzeile);
    }

    /// <summary>Zerlegt eine Zeile und beachtet dabei Felder in Anführungszeichen.</summary>
    private static List<string> ZerlegeZeile(string zeile, char trenner)
    {
        var felder = new List<string>();
        var aktuell = new StringBuilder();
        var inAnfuehrung = false;

        for (var i = 0; i < zeile.Length; i++)
        {
            var zeichen = zeile[i];

            if (zeichen == '"')
            {
                // Zwei Anführungszeichen hintereinander stehen für eines im Text.
                if (inAnfuehrung && i + 1 < zeile.Length && zeile[i + 1] == '"')
                {
                    aktuell.Append('"');
                    i++;
                }
                else
                {
                    inAnfuehrung = !inAnfuehrung;
                }
            }
            else if (zeichen == trenner && !inAnfuehrung)
            {
                felder.Add(aktuell.ToString());
                aktuell.Clear();
            }
            else
            {
                aktuell.Append(zeichen);
            }
        }

        felder.Add(aktuell.ToString());
        return felder;
    }
}

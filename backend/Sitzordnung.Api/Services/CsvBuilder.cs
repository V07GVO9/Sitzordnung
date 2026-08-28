using System.Text;

namespace Sitzordnung.Api.Services;

/// <summary>
/// Baut CSV-Dateien, die Excel im deutschsprachigen Raum direkt richtig öffnet:
/// Semikolon als Trennzeichen und UTF-8 mit BOM.
/// </summary>
/// <summary>
/// Ein Wert aus einer festen Auswahl der App - etwa das Bewertungszeichen "++".
/// Solche Werte stammen nicht aus Benutzereingaben und werden deshalb nicht
/// gegen Formeln abgesichert, damit sie in der Tabelle lesbar bleiben.
/// </summary>
public readonly record struct CsvLiteral(string Value);

public class CsvBuilder
{
    private const char Separator = ';';

    private readonly StringBuilder _builder = new();

    public CsvBuilder AddRow(params object?[] values)
    {
        _builder.AppendLine(string.Join(Separator, values.Select(Escape)));
        return this;
    }

    /// <summary>
    /// Setzt Felder mit Trennzeichen, Anführungszeichen oder Zeilenumbruch in
    /// Anführungszeichen. Führende =, +, - und @ werden entschärft, damit Excel
    /// den Inhalt nicht als Formel auswertet.
    /// </summary>
    private static string Escape(object? value)
    {
        var text = value switch
        {
            null => string.Empty,
            CsvLiteral literal => literal.Value,
            bool b => b ? "ja" : "nein",
            DateOnly d => d.ToString("dd.MM.yyyy"),
            DateTimeOffset dt => dt.ToString("dd.MM.yyyy HH:mm"),
            IFormattable f => f.ToString(null, System.Globalization.CultureInfo.GetCultureInfo("de-DE")),
            _ => value.ToString() ?? string.Empty,
        };

        // Reine Zahlen sind unbedenklich - negative Punktzahlen sollen als Zahl ankommen.
        var looksLikeFormula = value is not CsvLiteral
            && text.Length > 0
            && text[0] is '=' or '+' or '-' or '@'
            && !decimal.TryParse(text, System.Globalization.NumberStyles.Number,
                System.Globalization.CultureInfo.GetCultureInfo("de-DE"), out _);

        if (looksLikeFormula)
        {
            text = "'" + text;
        }

        if (text.Contains(Separator) || text.Contains('"') || text.Contains('\n') || text.Contains('\r'))
        {
            text = '"' + text.Replace("\"", "\"\"") + '"';
        }

        return text;
    }

    /// <summary>Gibt die Datei als UTF-8-Bytes mit vorangestelltem BOM zurück.</summary>
    public byte[] ToBytes()
    {
        var utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
        return utf8.GetPreamble().Concat(utf8.GetBytes(_builder.ToString())).ToArray();
    }
}

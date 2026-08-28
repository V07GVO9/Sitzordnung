using System.Text;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Tests;

public class CsvBuilderTests
{
    private static string Render(CsvBuilder builder)
    {
        var bytes = builder.ToBytes();
        var bom = Encoding.UTF8.GetPreamble();

        Assert.True(bytes.Take(bom.Length).SequenceEqual(bom), "Die Datei muss mit einem UTF-8-BOM beginnen.");

        return Encoding.UTF8.GetString(bytes, bom.Length, bytes.Length - bom.Length);
    }

    [Fact]
    public void Felder_werden_mit_Semikolon_getrennt()
    {
        var csv = new CsvBuilder().AddRow("Klasse", "Fach").AddRow("10a", "Mathematik");

        Assert.Equal($"Klasse;Fach{Environment.NewLine}10a;Mathematik{Environment.NewLine}", Render(csv));
    }

    [Fact]
    public void Ein_Semikolon_im_Text_wird_in_Anfuehrungszeichen_gesetzt()
    {
        var csv = new CsvBuilder().AddRow("Meier; Anna");

        Assert.Contains("\"Meier; Anna\"", Render(csv));
    }

    [Fact]
    public void Anfuehrungszeichen_im_Text_werden_verdoppelt()
    {
        var csv = new CsvBuilder().AddRow("Anna \"Ani\" Meier");

        Assert.Contains("\"Anna \"\"Ani\"\" Meier\"", Render(csv));
    }

    [Fact]
    public void Ein_Kommentar_der_wie_eine_Formel_beginnt_wird_entschaerft()
    {
        var csv = new CsvBuilder().AddRow("=1+1");

        Assert.StartsWith("'=1+1", Render(csv));
    }

    [Fact]
    public void Negative_Punktzahlen_bleiben_Zahlen()
    {
        var csv = new CsvBuilder().AddRow(-3);

        Assert.Equal($"-3{Environment.NewLine}", Render(csv));
    }

    [Fact]
    public void Bewertungszeichen_bleiben_lesbar()
    {
        var csv = new CsvBuilder().AddRow(new CsvLiteral("++"), new CsvLiteral("--"));

        Assert.Equal($"++;--{Environment.NewLine}", Render(csv));
    }

    [Fact]
    public void Ein_Datum_wird_deutsch_formatiert()
    {
        var csv = new CsvBuilder().AddRow(new DateOnly(2025, 9, 3));

        Assert.Equal($"03.09.2025{Environment.NewLine}", Render(csv));
    }

    [Fact]
    public void Leere_Werte_erzeugen_leere_Felder()
    {
        var csv = new CsvBuilder().AddRow("a", null, "c");

        Assert.Equal($"a;;c{Environment.NewLine}", Render(csv));
    }
}

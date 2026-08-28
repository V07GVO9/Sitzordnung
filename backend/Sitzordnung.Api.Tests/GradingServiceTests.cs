using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Tests;

public class GradingServiceTests
{
    private static GradeScale StandardScale() => new()
    {
        Name = "Standard",
        Entries = new List<GradeScaleEntry>
        {
            new() { MinPoints = 12, Grade = "1" },
            new() { MinPoints = 8, Grade = "2" },
            new() { MinPoints = 4, Grade = "3" },
            new() { MinPoints = 0, Grade = "4" },
            new() { MinPoints = -4, Grade = "5" },
            new() { MinPoints = -1000, Grade = "6" },
        },
    };

    [Theory]
    [InlineData(20, "1")]
    [InlineData(12, "1")]
    [InlineData(11, "2")]
    [InlineData(4, "3")]
    [InlineData(0, "4")]   // wer bei 0 startet und nichts tut, steht auf 4
    [InlineData(-1, "5")]
    [InlineData(-50, "6")]
    public void Punkte_werden_auf_die_passende_Note_abgebildet(int points, string expected)
    {
        Assert.Equal(expected, GradingService.ResolveGrade(StandardScale(), points));
    }

    [Fact]
    public void Ohne_Notenschluessel_gibt_es_keine_Note()
    {
        Assert.Null(GradingService.ResolveGrade(null, 5));
    }

    [Fact]
    public void Ein_Schluessel_ohne_Stufen_liefert_keine_Note()
    {
        Assert.Null(GradingService.ResolveGrade(new GradeScale { Name = "Leer" }, 5));
    }

    [Fact]
    public void Unterhalb_der_niedrigsten_Stufe_gibt_es_keine_Note()
    {
        var scale = new GradeScale
        {
            Name = "Nur gute Noten",
            Entries = new List<GradeScaleEntry> { new() { MinPoints = 10, Grade = "1" } },
        };

        Assert.Null(GradingService.ResolveGrade(scale, 9));
        Assert.Equal("1", GradingService.ResolveGrade(scale, 10));
    }

    [Fact]
    public async Task Der_Kursschluessel_geht_dem_globalen_Schluessel_vor()
    {
        using var test = new TestDatabase();

        var schoolClass = new SchoolClass { Name = "10a" };
        var subject = new Subject { Name = "Mathematik", ShortName = "MA" };
        test.Context.SchoolClasses.Add(schoolClass);
        test.Context.Subjects.Add(subject);
        test.Context.SaveChanges();

        var course = new Course { SchoolClassId = schoolClass.Id, SubjectId = subject.Id };
        test.Context.Courses.Add(course);
        test.Context.SaveChanges();

        test.Context.GradeScales.Add(new GradeScale
        {
            Name = "Global",
            CourseId = null,
            Entries = new List<GradeScaleEntry> { new() { MinPoints = 0, Grade = "global" } },
        });
        test.Context.GradeScales.Add(new GradeScale
        {
            Name = "Nur für diesen Kurs",
            CourseId = course.Id,
            Entries = new List<GradeScaleEntry> { new() { MinPoints = 0, Grade = "kursspezifisch" } },
        });
        test.Context.SaveChanges();

        var service = new GradingService(test.Context);
        var scale = await service.GetEffectiveScaleAsync(course.Id);

        Assert.Equal("kursspezifisch", GradingService.ResolveGrade(scale, 3));
    }

    [Fact]
    public async Task Ohne_eigenen_Schluessel_gilt_der_globale()
    {
        using var test = new TestDatabase();

        var schoolClass = new SchoolClass { Name = "10a" };
        var subject = new Subject { Name = "Mathematik", ShortName = "MA" };
        test.Context.SchoolClasses.Add(schoolClass);
        test.Context.Subjects.Add(subject);
        test.Context.SaveChanges();

        var course = new Course { SchoolClassId = schoolClass.Id, SubjectId = subject.Id };
        test.Context.Courses.Add(course);
        test.Context.GradeScales.Add(new GradeScale
        {
            Name = "Global",
            CourseId = null,
            Entries = new List<GradeScaleEntry> { new() { MinPoints = 0, Grade = "global" } },
        });
        test.Context.SaveChanges();

        var service = new GradingService(test.Context);
        var scale = await service.GetEffectiveScaleAsync(course.Id);

        Assert.Equal("global", GradingService.ResolveGrade(scale, 3));
    }
}

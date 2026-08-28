using Sitzordnung.Api.Data;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Tests;

/// <summary>
/// Bewertet werden darf jederzeit. Begrenzt ist nur die Menge: je
/// Unterrichtsstunde eine Bewertung. Diese Tests prüfen, welcher Stunde eine
/// Bewertung zugerechnet wird - daran hängt die ganze Regel.
/// </summary>
public class LessonServiceTests
{
    /// <summary>Ein fester Zeitpunkt, damit die Tests unabhängig von der echten Uhr laufen.</summary>
    private sealed class FixedClock : IClock
    {
        public FixedClock(DateTimeOffset now) => Now = now;

        public DateTimeOffset Now { get; }
    }

    // Mittwoch, 3. September 2025.
    private static DateTimeOffset AmMittwochUm(int hour, int minute) =>
        new(new DateTime(2025, 9, 3, hour, minute, 0), TimeSpan.Zero);

    private static int SetupCourse(AppDbContext db)
    {
        var schoolClass = new SchoolClass { Name = "10a" };
        var subject = new Subject { Name = "Mathematik", ShortName = "MA" };
        db.SchoolClasses.Add(schoolClass);
        db.Subjects.Add(subject);
        db.SaveChanges();

        var course = new Course { SchoolClassId = schoolClass.Id, SubjectId = subject.Id };
        db.Courses.Add(course);
        db.SaveChanges();

        return course.Id;
    }

    private static void AddLesson(AppDbContext db, int courseId, DayOfWeek day, string from, string to)
    {
        db.TimetableEntries.Add(new TimetableEntry
        {
            CourseId = courseId,
            DayOfWeek = day,
            StartTime = TimeOnly.Parse(from),
            EndTime = TimeOnly.Parse(to),
        });
        db.SaveChanges();
    }

    [Fact]
    public async Task Waehrend_des_Unterrichts_zaehlt_die_laufende_Stunde()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");

        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(10, 20)));
        var slot = await service.GetCurrentSlotAsync(courseId);

        Assert.Equal(new DateOnly(2025, 9, 3), slot.Date);
        Assert.Equal("10:00", slot.StartTime);
        Assert.True(slot.FromTimetable);
        Assert.Contains("läuft gerade", slot.Label);
    }

    [Fact]
    public async Task Nach_dem_Unterricht_zaehlt_weiter_dieselbe_Stunde()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");

        // Abends um 20 Uhr die Stunde von heute Vormittag nachtragen.
        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(20, 0)));
        var slot = await service.GetCurrentSlotAsync(courseId);

        Assert.Equal(new DateOnly(2025, 9, 3), slot.Date);
        Assert.Equal("10:00", slot.StartTime);
    }

    [Fact]
    public async Task Vor_dem_Unterricht_zaehlt_noch_die_Stunde_der_Vorwoche()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");

        // Morgens um 7 - der heutige Unterricht hat noch nicht begonnen.
        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(7, 0)));
        var slot = await service.GetCurrentSlotAsync(courseId);

        Assert.Equal(new DateOnly(2025, 8, 27), slot.Date);
    }

    [Fact]
    public async Task An_einem_anderen_Wochentag_zaehlt_die_letzte_Stunde()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Monday, "10:00", "10:45");

        // Mittwoch: der letzte Unterricht war am Montag.
        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(12, 0)));
        var slot = await service.GetCurrentSlotAsync(courseId);

        Assert.Equal(new DateOnly(2025, 9, 1), slot.Date);
        Assert.Equal("10:00", slot.StartTime);
    }

    [Fact]
    public async Task Bei_zwei_Stunden_am_selben_Tag_zaehlt_die_juengste()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "08:00", "08:45");
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "11:00", "11:45");

        // Nach beiden Stunden zählt die spätere - sie ist die letzte gehaltene.
        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(14, 0)));
        Assert.Equal("11:00", (await service.GetCurrentSlotAsync(courseId)).StartTime);

        // Zwischen beiden Stunden zählt noch die erste.
        var frueher = new LessonService(test.Context, new FixedClock(AmMittwochUm(9, 30)));
        Assert.Equal("08:00", (await frueher.GetCurrentSlotAsync(courseId)).StartTime);
    }

    [Fact]
    public async Task Ohne_Stundenplan_zaehlt_der_heutige_Tag()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);

        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(15, 0)));
        var slot = await service.GetCurrentSlotAsync(courseId);

        Assert.Equal(new DateOnly(2025, 9, 3), slot.Date);
        Assert.Equal("00:00", slot.StartTime);
        Assert.False(slot.FromTimetable);
        Assert.Contains("kein Stundenplan", slot.Label);
    }

    [Fact]
    public async Task Die_Stunden_anderer_Kurse_zaehlen_nicht_mit()
    {
        using var test = new TestDatabase();
        var matheKurs = SetupCourse(test.Context);

        var deutsch = new Subject { Name = "Deutsch", ShortName = "DE" };
        test.Context.Subjects.Add(deutsch);
        test.Context.SaveChanges();

        var deutschKurs = new Course { SchoolClassId = 1, SubjectId = deutsch.Id };
        test.Context.Courses.Add(deutschKurs);
        test.Context.SaveChanges();

        AddLesson(test.Context, matheKurs, DayOfWeek.Monday, "08:00", "08:45");
        AddLesson(test.Context, deutschKurs.Id, DayOfWeek.Wednesday, "10:00", "10:45");

        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(12, 0)));

        // Mathe war zuletzt am Montag, Deutsch heute.
        Assert.Equal(new DateOnly(2025, 9, 1), (await service.GetCurrentSlotAsync(matheKurs)).Date);
        Assert.Equal(new DateOnly(2025, 9, 3), (await service.GetCurrentSlotAsync(deutschKurs.Id)).Date);
    }

    [Fact]
    public async Task Die_laufende_Stunde_nennt_Klasse_und_Fach()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");

        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(10, 10)));
        var lesson = await service.GetCurrentLessonAsync();

        Assert.True(lesson.HasLesson);
        Assert.Equal(courseId, lesson.CourseId);
        Assert.Equal("10a", lesson.SchoolClassName);
        Assert.Equal("Mathematik", lesson.SubjectName);
    }

    [Fact]
    public async Task Ausserhalb_der_Unterrichtszeit_laeuft_keine_Stunde()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");

        var service = new LessonService(test.Context, new FixedClock(AmMittwochUm(18, 0)));

        Assert.False((await service.GetCurrentLessonAsync()).HasLesson);
    }
}

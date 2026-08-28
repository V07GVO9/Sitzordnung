using Sitzordnung.Api.Data;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Tests;

/// <summary>
/// Die zentrale Regel der App: bewertet werden darf nur, wenn der Kurs laut
/// Stundenplan gerade läuft.
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
    private static DateTimeOffset OnWednesdayAt(int hour, int minute) =>
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

    private static void SetSettings(AppDbContext db, int tolerance, bool allowOutside)
    {
        db.AppSettings.Add(new AppSettings
        {
            Id = AppSettings.SingletonId,
            ToleranceMinutes = tolerance,
            AllowRatingOutsideLesson = allowOutside,
        });
        db.SaveChanges();
    }

    [Fact]
    public async Task Ohne_Stundenplaneintrag_ist_die_Bewertung_gesperrt()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        SetSettings(test.Context, 15, false);

        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(10, 0)));
        var window = await service.GetRatingWindowAsync(courseId);

        Assert.False(window.CanRate);
        Assert.Contains("kein Unterricht", window.Reason);
    }

    [Fact]
    public async Task Waehrend_der_Stunde_ist_die_Bewertung_moeglich()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");
        SetSettings(test.Context, 15, false);

        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(10, 20)));
        var window = await service.GetRatingWindowAsync(courseId);

        Assert.True(window.CanRate);
        Assert.Equal("10:00", window.StartTime);
        Assert.Equal("10:45", window.EndTime);
    }

    [Theory]
    [InlineData(9, 50)]  // kurz vor der Stunde, innerhalb der Toleranz
    [InlineData(10, 0)]  // exakt zum Stundenbeginn
    [InlineData(10, 45)] // exakt zum Stundenende
    [InlineData(10, 59)] // kurz nach der Stunde, innerhalb der Toleranz
    public async Task Innerhalb_der_Toleranz_ist_die_Bewertung_moeglich(int hour, int minute)
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");
        SetSettings(test.Context, 15, false);

        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(hour, minute)));

        Assert.True((await service.GetRatingWindowAsync(courseId)).CanRate);
    }

    [Theory]
    [InlineData(9, 44)]  // zu früh
    [InlineData(11, 1)]  // zu spät
    public async Task Ausserhalb_der_Toleranz_ist_die_Bewertung_gesperrt(int hour, int minute)
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");
        SetSettings(test.Context, 15, false);

        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(hour, minute)));
        var window = await service.GetRatingWindowAsync(courseId);

        Assert.False(window.CanRate);
        Assert.Contains("10:00-10:45", window.Reason);
    }

    [Fact]
    public async Task Am_falschen_Wochentag_ist_die_Bewertung_gesperrt()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Monday, "10:00", "10:45");
        SetSettings(test.Context, 15, false);

        // Gleiche Uhrzeit, aber Mittwoch statt Montag.
        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(10, 20)));

        Assert.False((await service.GetRatingWindowAsync(courseId)).CanRate);
    }

    [Fact]
    public async Task Die_Toleranz_greift_nicht_ueber_den_Tageswechsel_hinaus()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "00:05", "00:50");
        SetSettings(test.Context, 15, false);

        // 23:50 Uhr liegt fast 24 Stunden von der Stunde entfernt und darf sie
        // nicht durch das Zurückrechnen der Toleranz treffen.
        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(23, 50)));

        Assert.False((await service.GetRatingWindowAsync(courseId)).CanRate);
    }

    [Fact]
    public async Task Die_Notfall_Freigabe_oeffnet_die_Bewertung_ausserhalb_des_Unterrichts()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        SetSettings(test.Context, 15, allowOutside: true);

        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(18, 0)));
        var window = await service.GetRatingWindowAsync(courseId);

        Assert.True(window.CanRate);
        Assert.Contains("Notfall-Freigabe", window.Reason);
    }

    [Fact]
    public async Task Die_laufende_Stunde_nennt_Klasse_und_Fach()
    {
        using var test = new TestDatabase();
        var courseId = SetupCourse(test.Context);
        AddLesson(test.Context, courseId, DayOfWeek.Wednesday, "10:00", "10:45");
        SetSettings(test.Context, 15, false);

        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(10, 10)));
        var lesson = await service.GetCurrentLessonAsync();

        Assert.True(lesson.HasLesson);
        Assert.Equal(courseId, lesson.CourseId);
        Assert.Equal("10a", lesson.SchoolClassName);
        Assert.Equal("Mathematik", lesson.SubjectName);
    }

    [Fact]
    public async Task Eine_Stunde_eines_anderen_Kurses_oeffnet_diesen_Kurs_nicht()
    {
        using var test = new TestDatabase();
        var mathCourseId = SetupCourse(test.Context);

        var otherSubject = new Subject { Name = "Deutsch", ShortName = "DE" };
        test.Context.Subjects.Add(otherSubject);
        test.Context.SaveChanges();

        var germanCourse = new Course { SchoolClassId = 1, SubjectId = otherSubject.Id };
        test.Context.Courses.Add(germanCourse);
        test.Context.SaveChanges();

        AddLesson(test.Context, germanCourse.Id, DayOfWeek.Wednesday, "10:00", "10:45");
        SetSettings(test.Context, 15, false);

        var service = new LessonService(test.Context, new FixedClock(OnWednesdayAt(10, 20)));

        Assert.True((await service.GetRatingWindowAsync(germanCourse.Id)).CanRate);
        Assert.False((await service.GetRatingWindowAsync(mathCourseId)).CanRate);
    }
}

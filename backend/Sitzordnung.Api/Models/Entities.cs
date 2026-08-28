using System.ComponentModel.DataAnnotations;

namespace Sitzordnung.Api.Models;

/// <summary>Eine Schulklasse, z.B. "10a" oder "KDM 23".</summary>
public class SchoolClass
{
    public int Id { get; set; }

    [MaxLength(60)]
    public string Name { get; set; } = string.Empty;

    public List<Student> Students { get; set; } = new();
    public List<Course> Courses { get; set; } = new();
}

/// <summary>Ein Unterrichtsfach, z.B. "Mathematik".</summary>
public class Subject
{
    public int Id { get; set; }

    [MaxLength(60)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Kurzform für die Anzeige im Stundenplan, z.B. "MA".</summary>
    [MaxLength(10)]
    public string ShortName { get; set; } = string.Empty;

    public List<Course> Courses { get; set; } = new();
}

/// <summary>
/// Die Kombination aus Klasse und Fach - also der konkrete Unterricht,
/// den die Lehrkraft hält. Sitzordnungen, Bewertungen, Notenschlüssel und
/// Stundenplaneinträge hängen immer an einem Kurs.
/// </summary>
public class Course
{
    public int Id { get; set; }

    public int SchoolClassId { get; set; }
    public SchoolClass? SchoolClass { get; set; }

    public int SubjectId { get; set; }
    public Subject? Subject { get; set; }

    public List<SeatingPlan> SeatingPlans { get; set; } = new();
    public List<TimetableEntry> TimetableEntries { get; set; } = new();
    public List<Rating> Ratings { get; set; } = new();
}

/// <summary>Ein Schüler. Gehört genau zu einer Klasse.</summary>
public class Student
{
    public int Id { get; set; }

    [MaxLength(80)]
    public string FirstName { get; set; } = string.Empty;

    [MaxLength(80)]
    public string LastName { get; set; } = string.Empty;

    /// <summary>Dateiname des Fotos im Fotoverzeichnis, null wenn kein Foto hinterlegt ist.</summary>
    [MaxLength(200)]
    public string? PhotoFileName { get; set; }

    public int SchoolClassId { get; set; }
    public SchoolClass? SchoolClass { get; set; }

    public List<Seat> Seats { get; set; } = new();
    public List<Rating> Ratings { get; set; } = new();
}

/// <summary>
/// Eine Sitzordnung für einen Kurs. Pro Kurs sind maximal
/// <see cref="MaxPlansPerCourse"/> Sitzordnungen erlaubt.
/// </summary>
public class SeatingPlan
{
    public const int MaxPlansPerCourse = 2;

    public int Id { get; set; }

    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    public int CourseId { get; set; }
    public Course? Course { get; set; }

    /// <summary>Anzahl der Sitzreihen im Raster.</summary>
    public int Rows { get; set; } = 5;

    /// <summary>Anzahl der Spalten im Raster.</summary>
    public int Columns { get; set; } = 8;

    public List<Seat> Seats { get; set; } = new();
}

/// <summary>Ein besetzter Platz im Raster einer Sitzordnung.</summary>
public class Seat
{
    public int Id { get; set; }

    public int SeatingPlanId { get; set; }
    public SeatingPlan? SeatingPlan { get; set; }

    public int StudentId { get; set; }
    public Student? Student { get; set; }

    /// <summary>Nullbasierter Zeilenindex.</summary>
    public int Row { get; set; }

    /// <summary>Nullbasierter Spaltenindex.</summary>
    public int Column { get; set; }
}

/// <summary>
/// Ein Eintrag im Stundenplan: an diesem Wochentag von/bis findet der Kurs statt.
/// Nur während dieser Zeiten (plus Toleranz) sind Bewertungen möglich.
/// </summary>
public class TimetableEntry
{
    public int Id { get; set; }

    public int CourseId { get; set; }
    public Course? Course { get; set; }

    public DayOfWeek DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }

    [MaxLength(40)]
    public string? Room { get; set; }
}

/// <summary>
/// Eine einzelne Mitarbeitsbewertung. Jeder Schüler startet bei 0 Punkten,
/// jede Bewertung ist eine Veränderung (+1, +2, -1, -2) auf diesem Konto.
/// </summary>
public class Rating
{
    public int Id { get; set; }

    public int CourseId { get; set; }
    public Course? Course { get; set; }

    public int StudentId { get; set; }
    public Student? Student { get; set; }

    /// <summary>+2 = "++", +1 = "+", -1 = "-", -2 = "--".</summary>
    public int Value { get; set; }

    /// <summary>Der Unterrichtstag, auf den sich die Bewertung bezieht.</summary>
    public DateOnly LessonDate { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    [MaxLength(300)]
    public string? Comment { get; set; }
}

/// <summary>
/// Notenschlüssel: bildet die Summe der Mitarbeitspunkte auf eine Note ab.
/// Ein Schlüssel ohne <see cref="CourseId"/> gilt als globale Vorgabe für alle Kurse,
/// die keinen eigenen Schlüssel haben.
/// </summary>
public class GradeScale
{
    public int Id { get; set; }

    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    /// <summary>null = globaler Standardschlüssel.</summary>
    public int? CourseId { get; set; }
    public Course? Course { get; set; }

    public List<GradeScaleEntry> Entries { get; set; } = new();
}

/// <summary>Eine Stufe des Notenschlüssels: ab X Punkten gilt Note Y.</summary>
public class GradeScaleEntry
{
    public int Id { get; set; }

    public int GradeScaleId { get; set; }
    public GradeScale? GradeScale { get; set; }

    /// <summary>Untere Punktgrenze (einschließlich), ab der diese Note gilt.</summary>
    public int MinPoints { get; set; }

    /// <summary>Die Note als Text, z.B. "1", "2-" oder "sehr gut".</summary>
    [MaxLength(20)]
    public string Grade { get; set; } = string.Empty;
}

/// <summary>Globale Einstellungen der App. Es gibt genau einen Datensatz mit Id = 1.</summary>
public class AppSettings
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;

    /// <summary>
    /// Kulanzzeitraum in Minuten vor und nach der Unterrichtsstunde,
    /// in dem Bewertungen noch möglich sind.
    /// </summary>
    public int ToleranceMinutes { get; set; } = 15;

    /// <summary>
    /// Notfall-Freigabe: wenn true, sind Bewertungen auch außerhalb des
    /// Stundenplans möglich. Standardmäßig aus.
    /// </summary>
    public bool AllowRatingOutsideLesson { get; set; }
}

/// <summary>
/// Das Konto der Lehrkraft. Die App ist für eine Person gedacht; es gibt daher
/// in aller Regel genau einen Datensatz. Das Passwort wird nur als Hash abgelegt.
/// </summary>
public class AppUser
{
    public int Id { get; set; }

    [MaxLength(80)]
    public string Username { get; set; } = string.Empty;

    [MaxLength(400)]
    public string PasswordHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? LastLoginAt { get; set; }

    /// <summary>
    /// Solange true, verlangt die App nach dem Anmelden das Setzen eines eigenen
    /// Passworts - das Startpasswort taucht in Logs und Konfiguration auf.
    /// </summary>
    public bool MustChangePassword { get; set; }
}

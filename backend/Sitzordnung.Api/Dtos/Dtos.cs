using System.ComponentModel.DataAnnotations;

namespace Sitzordnung.Api.Dtos;

// --- Stammdaten -------------------------------------------------------------

public record SchoolClassDto(int Id, string Name, int StudentCount);

public class SchoolClassInput
{
    [Required, MaxLength(60)]
    public string Name { get; set; } = string.Empty;
}

public record SubjectDto(int Id, string Name, string ShortName);

public class SubjectInput
{
    [Required, MaxLength(60)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(10)]
    public string ShortName { get; set; } = string.Empty;
}

public record CourseDto(
    int Id,
    int SchoolClassId,
    string SchoolClassName,
    int SubjectId,
    string SubjectName,
    string SubjectShortName,
    int SeatingPlanCount);

public class CourseInput
{
    [Range(1, int.MaxValue)]
    public int SchoolClassId { get; set; }

    [Range(1, int.MaxValue)]
    public int SubjectId { get; set; }
}

public record StudentDto(
    int Id,
    string FirstName,
    string LastName,
    int SchoolClassId,
    bool HasPhoto,
    string? PhotoUrl);

public class StudentInput
{
    [Required, MaxLength(80)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(80)]
    public string LastName { get; set; } = string.Empty;
}

/// <summary>Eine Zeile beim Sammelimport von Schülern.</summary>
public class StudentImportInput
{
    [Required, MaxLength(80)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(80)]
    public string LastName { get; set; } = string.Empty;
}

// --- Sitzordnung ------------------------------------------------------------

public record SeatDto(int StudentId, int Row, int Column);

public record SeatingPlanDto(
    int Id,
    int CourseId,
    string Name,
    int Rows,
    int Columns,
    IReadOnlyList<SeatDto> Seats);

public class SeatingPlanInput
{
    [Required, MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    [Range(1, 20)]
    public int Rows { get; set; } = 5;

    [Range(1, 20)]
    public int Columns { get; set; } = 8;
}

/// <summary>Speichert die komplette Belegung einer Sitzordnung in einem Rutsch.</summary>
public class SeatLayoutInput
{
    [Range(1, 20)]
    public int Rows { get; set; } = 5;

    [Range(1, 20)]
    public int Columns { get; set; } = 8;

    public List<SeatInput> Seats { get; set; } = new();
}

public class SeatInput
{
    [Range(1, int.MaxValue)]
    public int StudentId { get; set; }

    [Range(0, 19)]
    public int Row { get; set; }

    [Range(0, 19)]
    public int Column { get; set; }
}

// --- Stundenplan ------------------------------------------------------------

public record TimetableEntryDto(
    int Id,
    int CourseId,
    string SchoolClassName,
    string SubjectName,
    DayOfWeek DayOfWeek,
    string StartTime,
    string EndTime,
    string? Room);

public class TimetableEntryInput
{
    [Range(1, int.MaxValue)]
    public int CourseId { get; set; }

    public DayOfWeek DayOfWeek { get; set; }

    /// <summary>Uhrzeit im Format HH:mm.</summary>
    [Required]
    public string StartTime { get; set; } = "08:00";

    /// <summary>Uhrzeit im Format HH:mm.</summary>
    [Required]
    public string EndTime { get; set; } = "08:45";

    [MaxLength(40)]
    public string? Room { get; set; }
}

/// <summary>Antwort auf die Frage "Habe ich gerade Unterricht?".</summary>
public record CurrentLessonDto(
    bool HasLesson,
    int? CourseId,
    string? SchoolClassName,
    string? SubjectName,
    string? StartTime,
    string? EndTime,
    string? Room,
    string Message);

/// <summary>Sagt für einen konkreten Kurs, ob gerade bewertet werden darf.</summary>
public record RatingWindowDto(bool CanRate, string Reason, string? StartTime, string? EndTime);

// --- Bewertungen ------------------------------------------------------------

public class RatingInput
{
    [Range(1, int.MaxValue)]
    public int CourseId { get; set; }

    [Range(1, int.MaxValue)]
    public int StudentId { get; set; }

    /// <summary>Erlaubt sind -2, -1, 1 und 2.</summary>
    public int Value { get; set; }

    [MaxLength(300)]
    public string? Comment { get; set; }
}

public record RatingDto(
    int Id,
    int CourseId,
    int StudentId,
    int Value,
    DateOnly LessonDate,
    DateTimeOffset CreatedAt,
    string? Comment);

/// <summary>Punktestand und Note eines Schülers in einem Kurs.</summary>
public record StudentScoreDto(
    int StudentId,
    string FirstName,
    string LastName,
    int Points,
    int RatingCount,
    int PointsToday,
    string? Grade);

public record CourseScoreboardDto(
    int CourseId,
    string SchoolClassName,
    string SubjectName,
    DateOnly Date,
    IReadOnlyList<StudentScoreDto> Students);

// --- Notenschlüssel ---------------------------------------------------------

public record GradeScaleEntryDto(int MinPoints, string Grade);

public record GradeScaleDto(
    int Id,
    int? CourseId,
    string Name,
    bool IsGlobalDefault,
    IReadOnlyList<GradeScaleEntryDto> Entries);

public class GradeScaleInput
{
    [Required, MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    public List<GradeScaleEntryInput> Entries { get; set; } = new();
}

public class GradeScaleEntryInput
{
    public int MinPoints { get; set; }

    [Required, MaxLength(20)]
    public string Grade { get; set; } = string.Empty;
}

// --- Einstellungen ----------------------------------------------------------

public record AppSettingsDto(int ToleranceMinutes, bool AllowRatingOutsideLesson);

public class AppSettingsInput
{
    [Range(0, 120)]
    public int ToleranceMinutes { get; set; } = 15;

    public bool AllowRatingOutsideLesson { get; set; }
}

// --- Anmeldung --------------------------------------------------------------

public class LoginInput
{
    [Required, MaxLength(80)]
    public string Username { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Password { get; set; } = string.Empty;

    /// <summary>Hält die Anmeldung 30 Tage statt nur einen Tag.</summary>
    public bool StayLoggedIn { get; set; }
}

public class ChangePasswordInput
{
    [Required, MaxLength(200)]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string NewPassword { get; set; } = string.Empty;
}

/// <summary>Wer ist angemeldet - und muss das Startpasswort noch geändert werden?</summary>
public record CurrentUserDto(string Username, bool MustChangePassword);

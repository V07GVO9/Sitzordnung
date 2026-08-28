using System.Net;
using System.Net.Http.Json;
using System.Text;
using Sitzordnung.Api.Dtos;

namespace Sitzordnung.Api.Tests;

/// <summary>
/// Fährt die API einmal komplett durch. Die Tests laufen gegen SQLite und decken
/// damit auch Abfragen auf, die sich nicht in SQL übersetzen lassen.
/// </summary>
public class ApiEndpointTests : IAsyncLifetime
{
    private readonly ApiFactory _factory = new();
    private HttpClient _client = null!;

    /// <summary>Alle Endpunkte verlangen eine Anmeldung, daher zuerst anmelden.</summary>
    public async Task InitializeAsync()
    {
        _client = await _factory.CreateSignedInClientAsync();
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<T> PostAsync<T>(string url, object body)
    {
        var response = await _client.PostAsJsonAsync(url, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    /// <summary>Legt Klasse, Fach, Kurs und Schüler an - die Grundlage aller Tests hier.</summary>
    private async Task<(int CourseId, int[] StudentIds)> SetupCourseAsync(string className, string subjectName)
    {
        var schoolClass = await PostAsync<SchoolClassDto>("/api/classes", new { name = className });
        var subject = await PostAsync<SubjectDto>(
            "/api/subjects", new { name = subjectName, shortName = subjectName[..2].ToUpperInvariant() });

        var course = await PostAsync<CourseDto>(
            "/api/courses", new { schoolClassId = schoolClass.Id, subjectId = subject.Id });

        var students = await PostAsync<List<StudentDto>>(
            $"/api/classes/{schoolClass.Id}/students/import",
            new[]
            {
                new { firstName = "Anna", lastName = "Berger" },
                new { firstName = "Ben", lastName = "Cordes" },
            });

        return (course.Id, students.Select(s => s.Id).ToArray());
    }

    /// <summary>Trägt eine Stunde ein, die zur Uhrzeit der Testuhr gerade läuft.</summary>
    private async Task AddRunningLessonAsync(int courseId)
    {
        var now = _factory.Clock.Now;
        var response = await _client.PostAsJsonAsync("/api/timetable", new
        {
            courseId,
            dayOfWeek = (int)now.DayOfWeek,
            startTime = now.AddMinutes(-10).ToString("HH\\:mm"),
            endTime = now.AddMinutes(35).ToString("HH\\:mm"),
            room = "A101",
        });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Alle_Uebersichtslisten_lassen_sich_abrufen()
    {
        // Diese Abfragen sortieren und verknüpfen über mehrere Tabellen hinweg.
        foreach (var url in new[]
                 {
                     "/api/classes", "/api/subjects", "/api/courses",
                     "/api/timetable", "/api/timetable/current", "/api/gradescales",
                 })
        {
            var response = await _client.GetAsync(url);
            Assert.True(response.IsSuccessStatusCode, $"{url} antwortete mit {(int)response.StatusCode}.");
        }
    }

    [Fact]
    public async Task Ein_Kurs_kann_nur_einmal_je_Klasse_und_Fach_angelegt_werden()
    {
        var schoolClass = await PostAsync<SchoolClassDto>("/api/classes", new { name = "Doppel-10b" });
        var subject = await PostAsync<SubjectDto>("/api/subjects", new { name = "Doppelfach", shortName = "DF" });

        var first = await _client.PostAsJsonAsync(
            "/api/courses", new { schoolClassId = schoolClass.Id, subjectId = subject.Id });
        var second = await _client.PostAsJsonAsync(
            "/api/courses", new { schoolClassId = schoolClass.Id, subjectId = subject.Id });

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Auch_ohne_Stundenplan_laesst_sich_bewerten()
    {
        var (courseId, students) = await SetupCourseAsync("Ohneplan-10c", "Planlosfach");

        var slot = await _client.GetFromJsonAsync<LessonSlotDto>($"/api/courses/{courseId}/current-lesson");
        Assert.False(slot!.FromTimetable);

        var response = await _client.PostAsJsonAsync(
            "/api/ratings", new { courseId, studentId = students[0], value = 1 });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Eine_zweite_Bewertung_in_derselben_Stunde_ersetzt_die_erste()
    {
        var (courseId, students) = await SetupCourseAsync("Ersetzen-10c", "Ersatzfach");
        await AddRunningLessonAsync(courseId);

        await _client.PostAsJsonAsync("/api/ratings", new { courseId, studentId = students[0], value = 2 });
        await _client.PostAsJsonAsync("/api/ratings", new { courseId, studentId = students[0], value = -1 });

        var board = await _client.GetFromJsonAsync<CourseScoreboardDto>($"/api/courses/{courseId}/scoreboard");
        var anna = board!.Students.Single(s => s.StudentId == students[0]);

        // Nicht 2 + (-1) = 1, sondern nur die letzte Bewertung dieser Stunde.
        Assert.Equal(-1, anna.Points);
        Assert.Equal(1, anna.RatingCount);
        Assert.Equal(-1, anna.CurrentLessonValue);
    }

    [Fact]
    public async Task In_der_naechsten_Unterrichtsstunde_ist_wieder_eine_Bewertung_moeglich()
    {
        var (courseId, students) = await SetupCourseAsync("Naechste-10c", "Folgefach");
        await AddRunningLessonAsync(courseId);

        await _client.PostAsJsonAsync("/api/ratings", new { courseId, studentId = students[0], value = 2 });

        // Eine Woche später ist es eine andere Unterrichtsstunde.
        _factory.Clock.Now = _factory.Clock.Now.AddDays(7);

        await _client.PostAsJsonAsync("/api/ratings", new { courseId, studentId = students[0], value = 1 });

        var board = await _client.GetFromJsonAsync<CourseScoreboardDto>($"/api/courses/{courseId}/scoreboard");
        var anna = board!.Students.Single(s => s.StudentId == students[0]);

        Assert.Equal(3, anna.Points);
        Assert.Equal(2, anna.RatingCount);
    }

    [Fact]
    public async Task Waehrend_des_Unterrichts_wird_bewertet_und_gezaehlt()
    {
        var (courseId, students) = await SetupCourseAsync("Bewerten-10d", "Wertfach");
        await AddRunningLessonAsync(courseId);

        var plus = await _client.PostAsJsonAsync(
            "/api/ratings", new { courseId, studentId = students[0], value = 2 });
        plus.EnsureSuccessStatusCode();

        var minus = await _client.PostAsJsonAsync(
            "/api/ratings", new { courseId, studentId = students[1], value = -2 });
        minus.EnsureSuccessStatusCode();

        var board = await _client.GetFromJsonAsync<CourseScoreboardDto>($"/api/courses/{courseId}/scoreboard");

        var anna = board!.Students.Single(s => s.StudentId == students[0]);
        var ben = board.Students.Single(s => s.StudentId == students[1]);

        Assert.Equal(2, anna.Points);
        Assert.Equal(1, anna.RatingCount);
        Assert.Equal(-2, ben.Points);
    }

    [Fact]
    public async Task Ungueltige_Bewertungen_werden_abgelehnt()
    {
        var (courseId, students) = await SetupCourseAsync("Ungueltig-10e", "Prueffach");
        await AddRunningLessonAsync(courseId);

        foreach (var value in new[] { 0, 3, -3, 100 })
        {
            var response = await _client.PostAsJsonAsync(
                "/api/ratings", new { courseId, studentId = students[0], value });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    [Fact]
    public async Task Die_letzte_Bewertung_laesst_sich_zuruecknehmen()
    {
        var (courseId, students) = await SetupCourseAsync("Undo-10f", "Undofach");
        await AddRunningLessonAsync(courseId);

        await _client.PostAsJsonAsync("/api/ratings", new { courseId, studentId = students[0], value = 2 });

        var undo = await _client.PostAsync($"/api/courses/{courseId}/students/{students[0]}/undo", null);
        Assert.Equal(HttpStatusCode.NoContent, undo.StatusCode);

        var board = await _client.GetFromJsonAsync<CourseScoreboardDto>($"/api/courses/{courseId}/scoreboard");
        var anna = board!.Students.Single(s => s.StudentId == students[0]);

        Assert.Equal(0, anna.Points);
        Assert.Equal(0, anna.RatingCount);
        Assert.Null(anna.CurrentLessonValue);
    }

    [Fact]
    public async Task Pro_Kurs_sind_hoechstens_zwei_Sitzordnungen_moeglich()
    {
        var (courseId, _) = await SetupCourseAsync("Plaene-10g", "Planfach");

        var first = await _client.PostAsJsonAsync(
            $"/api/courses/{courseId}/seatingplans", new { name = "Standard", rows = 4, columns = 6 });
        var second = await _client.PostAsJsonAsync(
            $"/api/courses/{courseId}/seatingplans", new { name = "Gruppen", rows = 4, columns = 6 });
        var third = await _client.PostAsJsonAsync(
            $"/api/courses/{courseId}/seatingplans", new { name = "Zu viel", rows = 4, columns = 6 });

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, third.StatusCode);
    }

    [Fact]
    public async Task Eine_Sitzordnung_wird_gespeichert_und_wieder_geladen()
    {
        var (courseId, students) = await SetupCourseAsync("Sitzen-10h", "Sitzfach");
        var plan = await PostAsync<SeatingPlanDto>(
            $"/api/courses/{courseId}/seatingplans", new { name = "Standard", rows = 4, columns = 6 });

        var layout = new
        {
            rows = 4,
            columns = 6,
            seats = new[]
            {
                new { studentId = students[0], row = 0, column = 0 },
                new { studentId = students[1], row = 1, column = 3 },
            },
        };

        var saved = await _client.PutAsJsonAsync($"/api/seatingplans/{plan.Id}/layout", layout);
        saved.EnsureSuccessStatusCode();

        var reloaded = await _client.GetFromJsonAsync<SeatingPlanDto>($"/api/seatingplans/{plan.Id}");

        Assert.Equal(2, reloaded!.Seats.Count);
        Assert.Contains(reloaded.Seats, s => s.StudentId == students[1] && s.Row == 1 && s.Column == 3);
    }

    [Fact]
    public async Task Zwei_Schueler_koennen_nicht_auf_denselben_Platz()
    {
        var (courseId, students) = await SetupCourseAsync("Kollision-10i", "Kollisionsfach");
        var plan = await PostAsync<SeatingPlanDto>(
            $"/api/courses/{courseId}/seatingplans", new { name = "Standard", rows = 4, columns = 6 });

        var response = await _client.PutAsJsonAsync($"/api/seatingplans/{plan.Id}/layout", new
        {
            rows = 4,
            columns = 6,
            seats = new[]
            {
                new { studentId = students[0], row = 0, column = 0 },
                new { studentId = students[1], row = 0, column = 0 },
            },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Ein_Platz_ausserhalb_des_Rasters_wird_abgelehnt()
    {
        var (courseId, students) = await SetupCourseAsync("Raster-10j", "Rasterfach");
        var plan = await PostAsync<SeatingPlanDto>(
            $"/api/courses/{courseId}/seatingplans", new { name = "Standard", rows = 3, columns = 3 });

        var response = await _client.PutAsJsonAsync($"/api/seatingplans/{plan.Id}/layout", new
        {
            rows = 3,
            columns = 3,
            seats = new[] { new { studentId = students[0], row = 5, column = 0 } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Ein_fremder_Schueler_darf_nicht_gesetzt_werden()
    {
        var (courseId, _) = await SetupCourseAsync("Eigen-10k", "Eigenfach");
        var (_, fremdeStudenten) = await SetupCourseAsync("Fremd-10l", "Fremdfach");

        var plan = await PostAsync<SeatingPlanDto>(
            $"/api/courses/{courseId}/seatingplans", new { name = "Standard", rows = 3, columns = 3 });

        var response = await _client.PutAsJsonAsync($"/api/seatingplans/{plan.Id}/layout", new
        {
            rows = 3,
            columns = 3,
            seats = new[] { new { studentId = fremdeStudenten[0], row = 0, column = 0 } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Sich_ueberschneidende_Stunden_werden_abgelehnt()
    {
        var (courseId, _) = await SetupCourseAsync("Plan-10m", "Planungsfach");

        var first = await _client.PostAsJsonAsync("/api/timetable", new
        {
            courseId,
            dayOfWeek = (int)DayOfWeek.Tuesday,
            startTime = "08:00",
            endTime = "08:45",
            room = (string?)null,
        });
        var overlapping = await _client.PostAsJsonAsync("/api/timetable", new
        {
            courseId,
            dayOfWeek = (int)DayOfWeek.Tuesday,
            startTime = "08:30",
            endTime = "09:15",
            room = (string?)null,
        });
        var wrongOrder = await _client.PostAsJsonAsync("/api/timetable", new
        {
            courseId,
            dayOfWeek = (int)DayOfWeek.Tuesday,
            startTime = "10:00",
            endTime = "09:00",
            room = (string?)null,
        });

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, overlapping.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, wrongOrder.StatusCode);
    }

    [Fact]
    public async Task Der_Notenschluessel_bestimmt_die_Note_im_Punktestand()
    {
        var (courseId, students) = await SetupCourseAsync("Noten-10n", "Notenfach");
        await AddRunningLessonAsync(courseId);

        await _client.PostAsJsonAsync("/api/ratings", new { courseId, studentId = students[0], value = 2 });

        var saved = await _client.PutAsJsonAsync($"/api/courses/{courseId}/gradescale", new
        {
            name = "Streng",
            entries = new[]
            {
                new { minPoints = 2, grade = "1" },
                new { minPoints = 0, grade = "4" },
            },
        });
        saved.EnsureSuccessStatusCode();

        var board = await _client.GetFromJsonAsync<CourseScoreboardDto>($"/api/courses/{courseId}/scoreboard");

        Assert.Equal("1", board!.Students.Single(s => s.StudentId == students[0]).Grade);
        Assert.Equal("4", board.Students.Single(s => s.StudentId == students[1]).Grade);
    }

    [Fact]
    public async Task Der_Export_liefert_eine_CSV_Datei_mit_den_Bewertungen()
    {
        var (courseId, students) = await SetupCourseAsync("Export-10o", "Exportfach");
        await AddRunningLessonAsync(courseId);

        await _client.PostAsJsonAsync("/api/ratings", new { courseId, studentId = students[0], value = 2 });

        var ratings = await _client.GetAsync($"/api/export/ratings.csv?courseId={courseId}");
        ratings.EnsureSuccessStatusCode();
        Assert.Equal("text/csv", ratings.Content.Headers.ContentType?.MediaType);

        var text = Encoding.UTF8.GetString(await ratings.Content.ReadAsByteArrayAsync());
        Assert.Contains("Nachname", text);
        Assert.Contains("Berger", text);
        Assert.Contains("++", text);

        var summary = await _client.GetAsync($"/api/export/summary.csv?courseId={courseId}");
        summary.EnsureSuccessStatusCode();

        var summaryText = Encoding.UTF8.GetString(await summary.Content.ReadAsByteArrayAsync());
        Assert.Contains("Punkte", summaryText);
        Assert.Contains("Berger", summaryText);
    }

}

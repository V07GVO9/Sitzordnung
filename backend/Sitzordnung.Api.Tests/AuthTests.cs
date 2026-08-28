using System.Net;
using System.Net.Http.Json;
using Sitzordnung.Api.Dtos;

namespace Sitzordnung.Api.Tests;

/// <summary>
/// Die Anmeldung ist das, was die Schülerdaten im Netz schützt. Diese Tests
/// prüfen, dass ohne sie wirklich nichts geht.
/// </summary>
public class AuthTests : IDisposable
{
    private readonly ApiFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    /// <summary>Jeder Endpunkt, der Daten liefert oder ändert.</summary>
    public static TheoryData<string, string> GeschuetzteEndpunkte() => new()
    {
        { "GET", "/api/classes" },
        { "GET", "/api/subjects" },
        { "GET", "/api/courses" },
        { "GET", "/api/timetable" },
        { "GET", "/api/timetable/current" },
        { "GET", "/api/settings" },
        { "GET", "/api/gradescales" },
        { "GET", "/api/classes/1/students" },
        { "GET", "/api/students/1/photo" },
        { "GET", "/api/courses/1/scoreboard" },
        { "GET", "/api/courses/1/rating-window" },
        { "GET", "/api/export/ratings.csv" },
        { "GET", "/api/export/summary.csv" },
        { "POST", "/api/classes" },
        { "POST", "/api/subjects" },
        { "POST", "/api/courses" },
        { "POST", "/api/ratings" },
        { "PUT", "/api/settings" },
        { "DELETE", "/api/classes/1" },
    };

    [Theory]
    [MemberData(nameof(GeschuetzteEndpunkte))]
    public async Task Ohne_Anmeldung_antwortet_jeder_Endpunkt_mit_401(string method, string url)
    {
        var client = _factory.CreateClient();

        var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method is "POST" or "PUT")
        {
            request.Content = JsonContent.Create(new { });
        }

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Die_Oberflaeche_selbst_laedt_ohne_Anmeldung()
    {
        var client = _factory.CreateClient();

        // Sonst gäbe es keine Seite, auf der man sich anmelden könnte.
        // Daten enthält sie nicht - die kommen ausschließlich über die API.
        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Mit_richtigem_Passwort_gelingt_die_Anmeldung()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = ApiFactory.TestUsername, password = ApiFactory.TestPassword });

        response.EnsureSuccessStatusCode();

        var user = await response.Content.ReadFromJsonAsync<CurrentUserDto>();
        Assert.Equal(ApiFactory.TestUsername, user!.Username);

        // Das Startpasswort stammt aus der Konfiguration und soll geändert werden.
        Assert.True(user.MustChangePassword);
    }

    [Theory]
    [InlineData("testlehrkraft", "falsches-passwort")]
    [InlineData("fremde-person", "test-passwort-123")]
    public async Task Falsche_Anmeldedaten_werden_abgelehnt(string username, string password)
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("testlehrkraft", "")]
    [InlineData("", "test-passwort-123")]
    public async Task Leere_Anmeldedaten_fallen_schon_in_der_Eingabepruefung_durch(string username, string password)
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Nach_der_Anmeldung_sind_die_Daten_erreichbar()
    {
        var client = await _factory.CreateSignedInClientAsync();

        var response = await client.GetAsync("/api/courses");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Nach_dem_Abmelden_ist_wieder_alles_gesperrt()
    {
        var client = await _factory.CreateSignedInClientAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/courses")).StatusCode);

        var logout = await client.PostAsync("/api/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/courses")).StatusCode);
    }

    [Fact]
    public async Task Das_Passwort_laesst_sich_aendern_und_gilt_danach()
    {
        var client = await _factory.CreateSignedInClientAsync();
        const string neuesPasswort = "ein-neues-langes-passwort";

        var change = await client.PostAsJsonAsync(
            "/api/auth/change-password",
            new { currentPassword = ApiFactory.TestPassword, newPassword = neuesPasswort });

        change.EnsureSuccessStatusCode();

        var user = await change.Content.ReadFromJsonAsync<CurrentUserDto>();
        Assert.False(user!.MustChangePassword);

        // Das alte Passwort darf nicht mehr funktionieren, das neue schon.
        var frisch = _factory.CreateClient();

        var mitAlt = await frisch.PostAsJsonAsync(
            "/api/auth/login",
            new { username = ApiFactory.TestUsername, password = ApiFactory.TestPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, mitAlt.StatusCode);

        var mitNeu = await frisch.PostAsJsonAsync(
            "/api/auth/login",
            new { username = ApiFactory.TestUsername, password = neuesPasswort });
        mitNeu.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Ohne_das_bisherige_Passwort_laesst_es_sich_nicht_aendern()
    {
        var client = await _factory.CreateSignedInClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/auth/change-password",
            new { currentPassword = "geraten", newPassword = "ein-neues-langes-passwort" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("kurz")]
    [InlineData("")]
    public async Task Zu_kurze_Passwoerter_werden_abgelehnt(string neu)
    {
        var client = await _factory.CreateSignedInClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/auth/change-password",
            new { currentPassword = ApiFactory.TestPassword, newPassword = neu });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Wer_nicht_angemeldet_ist_bekommt_bei_me_ein_401()
    {
        var client = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Viele_Fehlversuche_werden_ausgebremst()
    {
        var client = _factory.CreateClient();
        var statuses = new List<HttpStatusCode>();

        // Das Limit liegt bei 10 Versuchen je 5 Minuten.
        for (var i = 0; i < 15; i++)
        {
            var response = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = ApiFactory.TestUsername, password = "falsch" });

            statuses.Add(response.StatusCode);
        }

        Assert.Contains(HttpStatusCode.TooManyRequests, statuses);
    }
}

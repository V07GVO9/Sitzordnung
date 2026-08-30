using System.Net;
using System.Net.Http.Json;
using Sitzordnung.Api.Dtos;

namespace Sitzordnung.Api.Tests;

/// <summary>
/// Prüft Ersteinrichtung und Anmeldung. Die Endpunkte sind [AllowAnonymous],
/// die restlichen Tests ersetzen den Login ohnehin durch <see cref="TestAuthHandler"/>.
/// </summary>
public class AuthControllerTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    private readonly HttpClient _client;

    public AuthControllerTests()
    {
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task Status_ist_zunaechst_nicht_eingerichtet()
    {
        var status = await _client.GetFromJsonAsync<AuthStatusDto>("/api/auth/status");

        Assert.NotNull(status);
        Assert.False(status!.IsSetUp);
    }

    [Fact]
    public async Task Setup_vergibt_das_erste_Kennwort_und_meldet_an()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/setup", new { password = "sicheres-kennwort" });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var status = await _client.GetFromJsonAsync<AuthStatusDto>("/api/auth/status");
        Assert.True(status!.IsSetUp);
    }

    [Fact]
    public async Task Setup_ist_kein_zweites_Mal_moeglich()
    {
        await _client.PostAsJsonAsync("/api/auth/setup", new { password = "erstes-kennwort" });

        var response = await _client.PostAsJsonAsync("/api/auth/setup", new { password = "zweites-kennwort" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Login_mit_falschem_Kennwort_schlaegt_fehl()
    {
        await _client.PostAsJsonAsync("/api/auth/setup", new { password = "richtiges-kennwort" });

        var response = await _client.PostAsJsonAsync("/api/auth/login", new { password = "falsch" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_mit_richtigem_Kennwort_gelingt()
    {
        await _client.PostAsJsonAsync("/api/auth/setup", new { password = "richtiges-kennwort" });

        var response = await _client.PostAsJsonAsync("/api/auth/login", new { password = "richtiges-kennwort" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }
}

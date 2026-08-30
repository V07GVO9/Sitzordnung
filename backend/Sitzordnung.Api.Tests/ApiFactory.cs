using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Tests;

/// <summary>Eine Uhr, deren Zeit der Test vorgibt.</summary>
public class TestClock : IClock
{
    /// <summary>Mittwoch, 3. September 2025, 10:20 Uhr.</summary>
    public DateTimeOffset Now { get; set; } = new(new DateTime(2025, 9, 3, 10, 20, 0), TimeSpan.Zero);
}

/// <summary>
/// Startet die echte API gegen eine eigene SQLite-Datenbank im Arbeitsspeicher.
/// Jeder Test bekommt eine frische Instanz und läuft dabei durch dieselben
/// Abfragen wie der Betrieb - genau dort zeigen sich Ausdrücke, die SQLite nicht
/// übersetzen kann.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    private SqliteConnection? _connection;
    private string? _photoDirectory;

    public const string TestUsername = "testlehrkraft";
    public const string TestPassword = "test-passwort-123";

    public TestClock Clock { get; } = new();

    /// <summary>Ein Client, der bereits angemeldet ist - das Cookie bleibt erhalten.</summary>
    public async Task<HttpClient> CreateSignedInClientAsync()
    {
        var client = CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = TestUsername, password = TestPassword });

        response.EnsureSuccessStatusCode();

        return client;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        _photoDirectory = Path.Combine(
            Path.GetTempPath(), "sitzordnung-tests", Guid.NewGuid().ToString("N"));

        builder.UseEnvironment(Environments.Production);
        builder.UseSetting("Storage:PhotoDirectory", _photoDirectory);

        // Feste Anmeldedaten, damit die Tests sich anmelden können.
        builder.UseSetting("Auth:Username", TestUsername);
        builder.UseSetting("Auth:InitialPassword", TestPassword);

        // Der Testserver spricht HTTP; ein "Secure"-Cookie käme nicht zurück.
        builder.UseSetting("Auth:RequireHttps", "false");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<AppDbContext>();
            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection!));

            services.RemoveAll<IClock>();
            services.AddSingleton<IClock>(Clock);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (!disposing)
        {
            return;
        }

        _connection?.Dispose();
        _connection = null;

        if (_photoDirectory is not null && Directory.Exists(_photoDirectory))
        {
            Directory.Delete(_photoDirectory, recursive: true);
        }
    }
}

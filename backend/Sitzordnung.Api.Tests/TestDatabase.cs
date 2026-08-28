using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;

namespace Sitzordnung.Api.Tests;

/// <summary>
/// Eine SQLite-Datenbank im Arbeitsspeicher. Sie verhält sich wie die echte
/// Datenbank - inklusive der Abbildung von DateOnly und TimeOnly - und ist nach
/// dem Test wieder verschwunden.
/// </summary>
public sealed class TestDatabase : IDisposable
{
    private readonly SqliteConnection _connection;

    public TestDatabase()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        Context = new AppDbContext(options);
        Context.Database.EnsureCreated();
    }

    public AppDbContext Context { get; }

    public void Dispose()
    {
        Context.Dispose();
        _connection.Dispose();
    }
}

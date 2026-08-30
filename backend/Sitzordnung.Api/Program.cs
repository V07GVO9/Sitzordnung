using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

var builder = WebApplication.CreateBuilder(args);

const string DevCorsPolicy = "AngularDevServer";

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=App_Data/sitzordnung.db";

builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddSingleton<PhotoStorage>();
builder.Services.AddScoped<LessonService>();
builder.Services.AddScoped<GradingService>();

// Ein einziges Login für die Lehrkraft, keine Schülerzugänge. Jeder Endpunkt
// ist standardmäßig geschützt (siehe AuthorizeFilter unten); AuthController
// öffnet Anmeldung/Ersteinrichtung bewusst mit [AllowAnonymous].
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "sitzordnung_auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.ExpireTimeSpan = TimeSpan.FromHours(12);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddControllers(options =>
    options.Filters.Add(new AuthorizeFilter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Im Betrieb liefert dasselbe Programm das gebaute Angular-Frontend aus, dann
// ist kein CORS nötig. Nur der Angular-Entwicklungsserver kommt von einem
// anderen Port und braucht diese Freigabe.
builder.Services.AddCors(options => options.AddPolicy(DevCorsPolicy, policy => policy
    .WithOrigins("http://localhost:4200", "https://localhost:4200")
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

// Datenbank anlegen bzw. auf den aktuellen Stand bringen und die Grundeinstellungen sicherstellen.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var dbPath = db.Database.GetDbConnection().DataSource;
    var directory = Path.GetDirectoryName(dbPath);
    if (!string.IsNullOrEmpty(directory))
    {
        Directory.CreateDirectory(directory);
    }

    await db.Database.MigrateAsync();
    await SeedAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors(DevCorsPolicy);
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Alle übrigen Anfragen gehen an die Angular-Anwendung, damit deren
// Routen auch beim direkten Aufruf oder Neuladen funktionieren.
app.MapFallbackToFile("index.html");

app.Run();

static async Task SeedAsync(AppDbContext db)
{
    if (!await db.AppSettings.AnyAsync())
    {
        db.AppSettings.Add(new AppSettings { Id = AppSettings.SingletonId });
    }

    // Ein Vorschlag für den Notenschlüssel, damit die Notenspalte von Anfang an
    // etwas anzeigt. Er lässt sich in der Oberfläche jederzeit überschreiben.
    if (!await db.GradeScales.AnyAsync())
    {
        db.GradeScales.Add(new GradeScale
        {
            Name = "Standard-Notenschlüssel",
            CourseId = null,
            Entries = new List<GradeScaleEntry>
            {
                new() { MinPoints = 12, Grade = "1" },
                new() { MinPoints = 8, Grade = "2" },
                new() { MinPoints = 4, Grade = "3" },
                new() { MinPoints = 0, Grade = "4" },
                new() { MinPoints = -4, Grade = "5" },
                // Auffangstufe: alles unterhalb der Note 5.
                new() { MinPoints = -1000, Grade = "6" },
            },
        });
    }

    await db.SaveChangesAsync();
}

/// <summary>Für Integrationstests sichtbar gemacht.</summary>
public partial class Program;

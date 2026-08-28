using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
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
builder.Services.AddSingleton<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();
builder.Services.AddScoped<LessonService>();
builder.Services.AddScoped<GradingService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<TimetableImportService>();
builder.Services.AddScoped<StudentImportService>();

// Anmeldung über ein Sitzungs-Cookie. Die App wird von derselben Adresse
// ausgeliefert wie die API, deshalb genügt SameSite=Strict als Schutz davor,
// dass fremde Seiten Anfragen im Namen der Lehrkraft stellen.
// Im Betrieb wird das Cookie als "Secure" gesetzt und damit nur über HTTPS
// übertragen. Für lokale Tests über HTTP lässt sich das abschalten.
var requireHttps = builder.Configuration.GetValue(
    "Auth:RequireHttps",
    !builder.Environment.IsDevelopment());

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "sitzordnung.auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = requireHttps
            ? CookieSecurePolicy.Always
            : CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromDays(1);
        options.SlidingExpiration = true;

        // Eine API antwortet mit 401 und 403, statt auf eine Anmeldeseite umzuleiten.
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

// Alles ist geschützt, sofern ein Endpunkt nicht ausdrücklich [AllowAnonymous] trägt.
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// Bremst das Durchprobieren von Passwörtern aus.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unbekannt",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(5),
        }));
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Im Betrieb liefert dasselbe Programm das gebaute Angular-Frontend aus, dann
// ist kein CORS nötig. Nur der Angular-Entwicklungsserver kommt von einem
// anderen Port und braucht diese Freigabe.
builder.Services.AddCors(options => options.AddPolicy(DevCorsPolicy, policy => policy
    .WithOrigins("http://localhost:4200", "https://localhost:4200")
    .AllowCredentials()
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

// Datenbank anlegen bzw. auf den aktuellen Stand bringen und die Grunddaten sicherstellen.
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

    var users = scope.ServiceProvider.GetRequiredService<UserService>();
    await users.EnsureInitialUserAsync(app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors(DevCorsPolicy);
}
else
{
    // Hinter dem Reverse-Proxy wird ausschließlich über HTTPS ausgeliefert.
    app.UseHsts();
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Zeigt, ob die Anwendung läuft - vom Reverse-Proxy und von Docker genutzt.
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();

// Alle übrigen Anfragen gehen an die Angular-Anwendung, damit deren Routen auch
// beim direkten Aufruf funktionieren. Die Seite selbst enthält keine Daten - die
// holt sie sich über die API, und die verlangt eine Anmeldung.
app.MapFallbackToFile("index.html").AllowAnonymous();

app.Run();

static async Task SeedAsync(AppDbContext db)
{
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

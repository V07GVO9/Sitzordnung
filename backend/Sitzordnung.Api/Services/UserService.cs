using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Services;

/// <summary>
/// Verwaltet das Konto der Lehrkraft: Passwörter prüfen, ändern und beim ersten
/// Start ein Konto anlegen. Passwörter werden ausschließlich als Hash gespeichert.
/// </summary>
public class UserService
{
    /// <summary>Kürzere Passwörter nimmt die App nicht an.</summary>
    public const int MinPasswordLength = 10;

    private readonly AppDbContext _db;
    private readonly IClock _clock;
    private readonly IPasswordHasher<AppUser> _hasher;
    private readonly ILogger<UserService> _logger;

    public UserService(
        AppDbContext db,
        IClock clock,
        IPasswordHasher<AppUser> hasher,
        ILogger<UserService> logger)
    {
        _db = db;
        _clock = clock;
        _hasher = hasher;
        _logger = logger;
    }

    public Task<AppUser?> FindAsync(string username, CancellationToken ct = default) =>
        _db.Users.FirstOrDefaultAsync(u => u.Username == username, ct);

    public Task<AppUser?> FindByIdAsync(int id, CancellationToken ct = default) =>
        _db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);

    /// <summary>
    /// Prüft die Anmeldedaten. Ist der Benutzername unbekannt, wird trotzdem ein
    /// Hash berechnet, damit die Antwortzeit keinen Rückschluss darauf zulässt.
    /// </summary>
    public async Task<AppUser?> VerifyAsync(string username, string password, CancellationToken ct = default)
    {
        var user = await FindAsync(username, ct);

        if (user is null)
        {
            _hasher.HashPassword(new AppUser(), password);
            return null;
        }

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, password);

        if (result == PasswordVerificationResult.Failed)
        {
            return null;
        }

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = _hasher.HashPassword(user, password);
        }

        user.LastLoginAt = _clock.Now;
        await _db.SaveChangesAsync(ct);

        return user;
    }

    public async Task SetPasswordAsync(AppUser user, string password, CancellationToken ct = default)
    {
        user.PasswordHash = _hasher.HashPassword(user, password);
        user.MustChangePassword = false;
        await _db.SaveChangesAsync(ct);
    }

    public static string? ValidatePassword(string? password) => password switch
    {
        null or "" => "Bitte ein Passwort angeben.",
        { Length: < MinPasswordLength } => $"Das Passwort muss mindestens {MinPasswordLength} Zeichen lang sein.",
        _ => null,
    };

    /// <summary>
    /// Legt beim ersten Start ein Konto an. Benutzername und Startpasswort kommen
    /// aus der Konfiguration; fehlt das Passwort, wird eines erzeugt und einmalig
    /// ins Log geschrieben. In beiden Fällen muss es nach dem Anmelden geändert werden.
    /// </summary>
    public async Task EnsureInitialUserAsync(IConfiguration configuration, CancellationToken ct = default)
    {
        if (await _db.Users.AnyAsync(ct))
        {
            return;
        }

        var username = configuration["Auth:Username"];
        if (string.IsNullOrWhiteSpace(username))
        {
            username = "lehrkraft";
        }

        var password = configuration["Auth:InitialPassword"];
        var generated = false;

        if (string.IsNullOrWhiteSpace(password) || ValidatePassword(password) is not null)
        {
            password = GeneratePassword();
            generated = true;
        }

        var user = new AppUser
        {
            Username = username.Trim(),
            CreatedAt = _clock.Now,
            MustChangePassword = true,
        };
        user.PasswordHash = _hasher.HashPassword(user, password);

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        if (generated)
        {
            _logger.LogWarning(
                "Konto '{Username}' wurde angelegt. Startpasswort: {Password} - " +
                "bitte nach dem ersten Anmelden ändern.",
                user.Username,
                password);
        }
        else
        {
            _logger.LogInformation(
                "Konto '{Username}' wurde mit dem konfigurierten Startpasswort angelegt. " +
                "Bitte nach dem ersten Anmelden ändern.",
                user.Username);
        }
    }

    /// <summary>Erzeugt ein zufälliges Passwort ohne leicht verwechselbare Zeichen.</summary>
    private static string GeneratePassword()
    {
        const string alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var chars = new char[16];

        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        }

        return new string(chars);
    }
}

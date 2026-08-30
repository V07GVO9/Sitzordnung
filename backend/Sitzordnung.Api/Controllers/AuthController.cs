using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Models;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

/// <summary>
/// Anmeldung der Lehrkraft. Die App hat genau ein Login (kein Schülerzugang) -
/// beim ersten Start wird das Kennwort einmalig vergeben, danach meldet man
/// sich damit per Cookie an.
/// </summary>
[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;

    public AuthController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("status")]
    public async Task<ActionResult<AuthStatusDto>> Status(CancellationToken ct)
    {
        var settings = await _db.AppSettings.FindAsync(new object[] { AppSettings.SingletonId }, ct);
        var isSetUp = !string.IsNullOrEmpty(settings?.PasswordHash);
        return Ok(new AuthStatusDto(isSetUp, User.Identity?.IsAuthenticated ?? false));
    }

    /// <summary>Vergibt einmalig das Kennwort. Danach ist dieser Weg gesperrt.</summary>
    [HttpPost("setup")]
    public async Task<IActionResult> Setup(SetupInput input, CancellationToken ct)
    {
        var settings = await _db.AppSettings.FindAsync(new object[] { AppSettings.SingletonId }, ct);
        if (settings is null)
        {
            settings = new AppSettings();
            _db.AppSettings.Add(settings);
        }

        if (!string.IsNullOrEmpty(settings.PasswordHash))
        {
            return Conflict("Es wurde bereits ein Kennwort eingerichtet.");
        }

        settings.PasswordHash = PasswordHasher.Hash(input.Password);
        await _db.SaveChangesAsync(ct);

        await SignInAsync();
        return NoContent();
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginInput input, CancellationToken ct)
    {
        var settings = await _db.AppSettings.FindAsync(new object[] { AppSettings.SingletonId }, ct);
        if (!PasswordHasher.Verify(input.Password, settings?.PasswordHash))
        {
            return Unauthorized();
        }

        await SignInAsync();
        return NoContent();
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordInput input, CancellationToken ct)
    {
        var settings = await _db.AppSettings.FindAsync(new object[] { AppSettings.SingletonId }, ct);
        if (!PasswordHasher.Verify(input.CurrentPassword, settings?.PasswordHash))
        {
            return Unauthorized();
        }

        settings!.PasswordHash = PasswordHasher.Hash(input.NewPassword);
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    private async Task SignInAsync()
    {
        var identity = new ClaimsIdentity(
            new[] { new Claim(ClaimTypes.Name, "Lehrkraft") },
            CookieAuthenticationDefaults.AuthenticationScheme);

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
    }
}

using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserService _users;
    private readonly ILogger<AuthController> _logger;

    public AuthController(UserService users, ILogger<AuthController> logger)
    {
        _users = users;
        _logger = logger;
    }

    /// <summary>
    /// Meldet an und setzt das Sitzungs-Cookie. Der Endpunkt ist mengenbegrenzt,
    /// damit Passwörter nicht durchprobiert werden können.
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [HttpPost("login")]
    public async Task<ActionResult<CurrentUserDto>> Login(LoginInput input, CancellationToken ct)
    {
        var user = await _users.VerifyAsync(input.Username?.Trim() ?? string.Empty, input.Password ?? string.Empty, ct);

        if (user is null)
        {
            _logger.LogWarning("Fehlgeschlagene Anmeldung für '{Username}'.", input.Username);
            return Unauthorized("Benutzername oder Passwort stimmt nicht.");
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties
            {
                IsPersistent = input.StayLoggedIn,
                ExpiresUtc = DateTimeOffset.UtcNow.AddDays(input.StayLoggedIn ? 30 : 1),
            });

        return Ok(new CurrentUserDto(user.Username, user.MustChangePassword));
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    /// <summary>
    /// Sagt der Oberfläche, wer angemeldet ist. Ohne Anmeldung kommt 401 - daran
    /// erkennt das Frontend, dass es die Anmeldeseite zeigen muss.
    /// </summary>
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserDto>> Me(CancellationToken ct)
    {
        var user = await CurrentUserAsync(ct);
        return user is null ? Unauthorized() : Ok(new CurrentUserDto(user.Username, user.MustChangePassword));
    }

    [HttpPost("change-password")]
    public async Task<ActionResult<CurrentUserDto>> ChangePassword(ChangePasswordInput input, CancellationToken ct)
    {
        var user = await CurrentUserAsync(ct);
        if (user is null)
        {
            return Unauthorized();
        }

        // Auch beim Ändern wird das alte Passwort verlangt - sonst genügt ein
        // fremder Zugriff auf eine offene Sitzung, um das Konto zu übernehmen.
        if (await _users.VerifyAsync(user.Username, input.CurrentPassword ?? string.Empty, ct) is null)
        {
            return BadRequest("Das bisherige Passwort stimmt nicht.");
        }

        if (UserService.ValidatePassword(input.NewPassword) is { } problem)
        {
            return BadRequest(problem);
        }

        await _users.SetPasswordAsync(user, input.NewPassword!, ct);

        return Ok(new CurrentUserDto(user.Username, user.MustChangePassword));
    }

    private async Task<Models.AppUser?> CurrentUserAsync(CancellationToken ct)
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(id, out var userId) ? await _users.FindByIdAsync(userId, ct) : null;
    }
}

using Microsoft.AspNetCore.Mvc;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Dtos;
using Sitzordnung.Api.Services;

namespace Sitzordnung.Api.Controllers;

[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly LessonService _lessons;

    public SettingsController(AppDbContext db, LessonService lessons)
    {
        _db = db;
        _lessons = lessons;
    }

    [HttpGet]
    public async Task<ActionResult<AppSettingsDto>> Get(CancellationToken ct)
    {
        var settings = await _lessons.GetSettingsAsync(ct);
        return Ok(new AppSettingsDto(settings.ToleranceMinutes, settings.AllowRatingOutsideLesson));
    }

    [HttpPut]
    public async Task<ActionResult<AppSettingsDto>> Update(AppSettingsInput input, CancellationToken ct)
    {
        var settings = await _lessons.GetSettingsAsync(ct);

        settings.ToleranceMinutes = input.ToleranceMinutes;
        settings.AllowRatingOutsideLesson = input.AllowRatingOutsideLesson;

        await _db.SaveChangesAsync(ct);

        return Ok(new AppSettingsDto(settings.ToleranceMinutes, settings.AllowRatingOutsideLesson));
    }
}

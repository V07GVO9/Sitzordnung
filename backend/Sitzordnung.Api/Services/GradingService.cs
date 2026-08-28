using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Data;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Services;

/// <summary>
/// Rechnet Mitarbeitspunkte in Noten um. Ein Kurs benutzt seinen eigenen
/// Notenschlüssel, sonst den globalen Standardschlüssel. Ist keiner hinterlegt,
/// bleibt die Note leer - die Punkte werden trotzdem gezählt.
/// </summary>
public class GradingService
{
    private readonly AppDbContext _db;

    public GradingService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<GradeScale?> GetEffectiveScaleAsync(int courseId, CancellationToken ct = default)
    {
        var courseScale = await _db.GradeScales
            .Include(g => g.Entries)
            .FirstOrDefaultAsync(g => g.CourseId == courseId, ct);

        if (courseScale is not null)
        {
            return courseScale;
        }

        return await _db.GradeScales
            .Include(g => g.Entries)
            .FirstOrDefaultAsync(g => g.CourseId == null, ct);
    }

    /// <summary>Sucht die Stufe mit der höchsten Punktgrenze, die der Punktestand noch erreicht.</summary>
    public static string? ResolveGrade(GradeScale? scale, int points)
    {
        if (scale is null || scale.Entries.Count == 0)
        {
            return null;
        }

        return scale.Entries
            .Where(e => points >= e.MinPoints)
            .OrderByDescending(e => e.MinPoints)
            .Select(e => e.Grade)
            .FirstOrDefault();
    }
}

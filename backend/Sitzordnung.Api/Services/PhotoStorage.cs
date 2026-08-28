namespace Sitzordnung.Api.Services;

/// <summary>
/// Legt Schülerfotos außerhalb von wwwroot im Datenverzeichnis ab. Ausgeliefert
/// werden sie ausschließlich über den StudentsController, nicht als statische Dateien.
/// </summary>
public class PhotoStorage
{
    /// <summary>Maximale Dateigröße eines Fotos in Bytes (5 MB).</summary>
    public const long MaxBytes = 5 * 1024 * 1024;

    private static readonly Dictionary<string, string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
        ["image/gif"] = ".gif",
    };

    private readonly string _directory;

    public PhotoStorage(IConfiguration configuration, IHostEnvironment environment)
    {
        var configured = configuration["Storage:PhotoDirectory"];
        _directory = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "App_Data", "photos")
            : Path.GetFullPath(configured, environment.ContentRootPath);

        Directory.CreateDirectory(_directory);
    }

    public static bool IsAllowedContentType(string? contentType) =>
        contentType is not null && AllowedTypes.ContainsKey(contentType);

    public static string ContentTypeFor(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        _ => "image/jpeg",
    };

    /// <summary>
    /// Speichert das Foto unter einem selbst vergebenen Namen. Der vom Client
    /// gelieferte Dateiname wird bewusst nicht übernommen.
    /// </summary>
    public async Task<string> SaveAsync(int studentId, IFormFile file, CancellationToken ct = default)
    {
        if (!AllowedTypes.TryGetValue(file.ContentType, out var extension))
        {
            throw new InvalidOperationException($"Dateityp '{file.ContentType}' wird nicht unterstützt.");
        }

        var fileName = $"student-{studentId}-{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(_directory, fileName);

        await using (var stream = File.Create(fullPath))
        {
            await file.CopyToAsync(stream, ct);
        }

        return fileName;
    }

    public void Delete(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return;
        }

        var fullPath = ResolvePath(fileName);
        if (fullPath is not null && File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }
    }

    /// <summary>
    /// Setzt den gespeicherten Dateinamen auf einen Pfad im Fotoverzeichnis um und
    /// stellt sicher, dass er das Verzeichnis nicht verlässt.
    /// </summary>
    public string? ResolvePath(string fileName)
    {
        var candidate = Path.GetFullPath(Path.Combine(_directory, fileName));
        var root = Path.GetFullPath(_directory) + Path.DirectorySeparatorChar;

        return candidate.StartsWith(root, StringComparison.Ordinal) ? candidate : null;
    }
}

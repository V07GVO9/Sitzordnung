namespace Sitzordnung.Api.Services;

/// <summary>
/// Abstraktion über die aktuelle Uhrzeit, damit die Stundenplanprüfung
/// in Tests mit festen Zeiten laufen kann.
/// </summary>
public interface IClock
{
    DateTimeOffset Now { get; }
}

public class SystemClock : IClock
{
    public DateTimeOffset Now => DateTimeOffset.Now;
}

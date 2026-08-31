// Liefert die gebaute Angular-Anwendung aus - mehr nicht.
//
// Die Daten liegen nicht mehr hier, sondern in einer verschlüsselten Datei auf
// dem Rechner der Lehrkraft. Dieses Programm kennt sie nicht und bekommt sie
// auch nie zu sehen; es gibt weder eine Datenbank noch eine Schnittstelle.

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Alle übrigen Anfragen gehen an die Angular-Anwendung, damit deren
// Routen auch beim direkten Aufruf oder Neuladen funktionieren.
app.MapFallbackToFile("index.html");

app.Run();

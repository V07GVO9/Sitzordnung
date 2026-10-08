# OneDrive-Ablage einrichten

Mit der OneDrive-Ablage liegt der Datenbestand nicht mehr auf einem einzelnen
Gerät, sondern in OneDrive im Ordner **Sitzordnung**. Jedes Gerät öffnet ihn
über den Reiter **OneDrive** auf der Startseite, mit demselben Passwort.

Die Datei bleibt dabei verschlüsselt. Ver- und entschlüsselt wird nur im
Browser. Microsoft speichert also nur die verschlüsselte Datei und bekommt
weder das Passwort noch Namen oder Noten zu sehen.

## Einmalig: die App bei Microsoft registrieren

Damit sich die App bei Microsoft anmelden darf, braucht sie eine
**Anwendungs-ID**. Die gibt es über eine App-Registrierung in Microsoft Entra.

1. Im [Microsoft Entra Admin Center](https://entra.microsoft.com) anmelden und
   **Anwendungen → App-Registrierungen → Neue Registrierung** öffnen.
   Dafür ist ein Microsoft-Entra-Verzeichnis nötig: entweder das der Schule
   (über die IT) oder ein eigenes, z. B. über ein kostenloses Azure-Konto.
2. Ausfüllen:
   - **Name:** `Sitzordnung`
   - **Unterstützte Kontotypen:** *Konten in einem beliebigen
     Organisationsverzeichnis und persönliche Microsoft-Konten*. Soll nur das
     Schulkonto gehen: *Nur Konten in diesem Organisationsverzeichnis* (dann
     unten bei `tenant` die Mandanten-ID eintragen).
   - **Umleitungs-URI:** Plattform **Single-Page-Anwendung (SPA)**, Adresse
     `https://sitzordnung.celik-soft.de/auth`
3. Nach dem Anlegen unter **Authentifizierung** weitere Umleitungs-URIs (SPA)
   ergänzen:
   - `https://test.sitzordnung.celik-soft.de/auth`
   - `http://localhost:4200/auth` (zum Entwickeln)
4. Unter **API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph →
   Delegierte Berechtigungen** den Eintrag `Files.ReadWrite` hinzufügen.
5. Auf der Übersichtsseite die **Anwendungs-ID (Client)** kopieren und in
   `frontend/src/app/core/store/onedrive.config.ts` bei `clientId` eintragen.
   Die ID ist kein Geheimnis. Sie darf ins Repository.

Danach die App wie gewohnt bauen und ausliefern. Der Reiter **OneDrive**
erscheint erst, wenn eine Anwendungs-ID eingetragen ist.

## Schulkonto: Freigabe durch die Schule

Viele Schulen erlauben Lehrkräften nicht, fremden Apps selbst Zugriff zu
geben. Dann meldet die App beim Anmelden, dass die Schule sie erst freigeben
muss. Abhilfe schafft die IT: Sie erteilt in Entra unter **Unternehmens-
anwendungen → Sitzordnung → Berechtigungen** die *Administratorzustimmung*.

Gute Argumente für die Freigabe:

- Die App sieht nur OneDrive (`Files.ReadWrite`), keine Mails und keinen Kalender.
- In OneDrive liegt nur verschlüsselter Inhalt (AES-GCM, Schlüssel aus dem
  Passwort per PBKDF2).
- Die Anmeldung läuft direkt bei Microsoft. Der eigene Server sieht weder
  Anmeldedaten noch Inhalte.

## Bedienung

| Aufgabe | So geht es |
| --- | --- |
| Erstes Gerät, vorhandene Datei | Datei wie bisher öffnen, dann **Datei & Passwort → In OneDrive ablegen** |
| Neuer Bestand direkt in OneDrive | Startseite → **OneDrive** → anmelden → **Neue Datei** |
| Weiteres Gerät | Startseite → **OneDrive** → anmelden → Datei wählen → Passwort |
| Datei löschen | Startseite → **OneDrive** → Papierkorb-Symbol neben der Datei |
| Export | Wie bisher unter **Auswertung & Export** |

Gespeichert wird automatisch wenige Sekunden nach jeder Änderung.

**Zwei Geräte gleichzeitig:** Hat ein anderes Gerät inzwischen gespeichert,
überschreibt die App dessen Stand nicht einfach. Sie fragt dann, welcher Stand
gilt: *Meinen Stand behalten* oder *Anderen Stand laden*. Am sichersten ist
es, auf einem Gerät zu arbeiten und den Bestand dort zu schließen, bevor es auf
dem nächsten weitergeht.

**Löschen:** OneDrive legt gelöschte Dateien zunächst in seinen Papierkorb.
Endgültig weg ist die Datei erst, wenn sie auch dort gelöscht ist.

## Grenzen

- **Android-App:** Dort ist OneDrive noch nicht eingebaut. Auf dem Handy die
  Web-Adresse im Browser öffnen (und bei Bedarf *Als App installieren*).
- **Ohne Internet** lässt sich ein OneDrive-Bestand nicht öffnen. Änderungen
  bleiben verschlüsselt im Zwischenspeicher des Browsers, bis wieder
  gespeichert werden kann.
- **Pop-ups:** Die Anmeldung öffnet ein kleines Microsoft-Fenster. Blockiert
  der Browser es, müssen Pop-ups für die Seite erlaubt werden.

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { AUTH_REDIRECT_PATH } from './app/core/store/onedrive.config';

if (location.pathname === AUTH_REDIRECT_PATH) {
  // Rückkehr von der Microsoft-Anmeldung (Anmeldefenster oder verstecktes
  // Fenster): die Antwort an die App weiterreichen, die App selbst nicht starten.
  import('@azure/msal-browser/redirect-bridge')
    .then((bridge) => bridge.broadcastResponseToMainFrame())
    .catch((err) => console.error(err));
} else {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}

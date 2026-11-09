// CLI entry for the onboarding (web local): Google sign-in (loopback) + FIEL.
// Usage: npm run onboard
import { startOnboardServer } from "./server.js";
import { FileFielStore } from "../fiel/store.js";
import { SessionStore } from "../auth/session.js";

const store = new FileFielStore();
const session = new SessionStore();

const { url } = await startOnboardServer(store, session, (s) => {
  console.log(`Sesión iniciada (idToken ${s.idToken.slice(0, 8)}…).`);
});

console.log(`Abriendo onboarding en ${url}`);
console.log("Pegá esa URL en tu navegador: iniciá sesión con Google y cargá .cer + .key + contraseña.");

// CLI entry for the e-firma onboarding (web local).
// Usage: npm run onboard
import { startOnboardServer } from "./server.js";
import { FileFielStore } from "../fiel/store.js";

const store = new FileFielStore();
const { url } = await startOnboardServer(store, (rfc) => {
  console.log(`FIEL almacenada para RFC ${rfc}.`);
});

console.log(`Abriendo onboarding en ${url} ...`);
console.log("Pegá esa URL en tu navegador y cargá .cer + .key + contraseña.");

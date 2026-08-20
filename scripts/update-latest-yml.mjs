// Après la signature SignPath, le contenu binaire de l'installateur change :
// le sha512/size que electron-builder a écrits dans latest.yml (calculés sur le
// fichier non signé) ne correspondent plus au fichier réellement publié.
// electron-updater refuse un fichier dont le sha512 ne correspond pas à latest.yml.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";

const [, , signedExePath, latestYmlPath] = process.argv;
if (!signedExePath || !latestYmlPath) {
  console.error("Usage: node update-latest-yml.mjs <exe-signé> <latest.yml>");
  process.exit(1);
}

const sha512 = createHash("sha512")
  .update(readFileSync(signedExePath))
  .digest("base64");
const size = statSync(signedExePath).size;

const yml = readFileSync(latestYmlPath, "utf8")
  .replace(/sha512: .*/g, `sha512: ${sha512}`)
  .replace(/size: \d+/g, `size: ${size}`);

writeFileSync(latestYmlPath, yml);
console.log(`latest.yml mis à jour avec le fichier signé : sha512=${sha512} size=${size}`);

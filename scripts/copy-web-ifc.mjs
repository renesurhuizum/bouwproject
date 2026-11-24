// Kopieert de web-ifc WebAssembly naar public/ zodat de IFC-import ook
// offline werkt (de browser laadt /web-ifc/web-ifc.wasm van de eigen site).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";

const src = "node_modules/web-ifc/web-ifc.wasm";
if (existsSync(src)) {
  mkdirSync("public/web-ifc", { recursive: true });
  copyFileSync(src, "public/web-ifc/web-ifc.wasm");
  console.log("web-ifc.wasm → public/web-ifc/");
}

import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

mkdirSync(".local", { recursive: true });
const privatePath = ".local/jwt-private.pem";
const publicPath = ".local/jwt-public.pem";
if (existsSync(privatePath) !== existsSync(publicPath))
  throw new Error(
    "Incomplete local key pair; restore the missing key instead of rotating identities.",
  );
if (!existsSync(privatePath)) {
  const pair = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(privatePath, pair.privateKey, { mode: 0o600 });
  writeFileSync(publicPath, pair.publicKey);
}

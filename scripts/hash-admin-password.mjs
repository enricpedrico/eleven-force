import { randomBytes, scryptSync } from "node:crypto";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
if (password.length < 12 || password.length > 128) {
  console.error("La contraseña debe tener entre 12 y 128 caracteres.");
  process.exit(1);
}
const salt = randomBytes(16);
const derived = scryptSync(password, salt, 32);
process.stdout.write(`${salt.toString("hex")}:${derived.toString("hex")}`);

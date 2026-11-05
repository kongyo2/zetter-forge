import { promises as fs } from "node:fs";
import path from "node:path";

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

let tempCounter = 0;

export async function writeFileAtomic(file: string, data: string | Buffer): Promise<void> {
  tempCounter += 1;
  const temp = `${file}.${process.pid}.${Date.now()}.${tempCounter}.tmp`;
  await fs.writeFile(temp, data);
  try {
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

export function writeJson(file: string, value: unknown): Promise<void> {
  return writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function removeAll(dir: string, names: readonly string[]): Promise<void> {
  await Promise.all(names.map((name) => fs.rm(path.join(dir, name), { force: true })));
}

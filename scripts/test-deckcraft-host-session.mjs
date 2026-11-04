import { spawnSync } from "node:child_process";
// Exercise the exact host document cleanup helper against the real native engine.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const temporary = await mkdtemp(join(tmpdir(), "imageslide-host-session-"));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with status ${result.status}`);
}
try {
  await cp(resolve(root, "vendor/deckcraft"), temporary, {
    recursive: true,
    filter: (path) => !path.endsWith("/.git"),
  });
  const shellPath = join(temporary, "apps/deckcraft-web/src/web.rs");
  const shell = await readFile(shellPath, "utf8");
  const match = shell.match(
    /fn retain_latest_document\(session: &mut Session\) \{[\s\S]*?\n\}/,
  );
  if (!match) throw new Error("Host document cleanup helper not found");
  const template = await readFile(
    resolve(root, "scripts/fixtures/deckcraft-host-session.rs"),
    "utf8",
  );
  if (!template.includes("// HOST_SESSION_HELPER"))
    throw new Error("Host session test placeholder not found");
  const tests = join(temporary, "crates/engine/tests");
  await mkdir(tests, { recursive: true });
  await writeFile(
    join(tests, "host_session_reuse.rs"),
    template.replace("// HOST_SESSION_HELPER", match[0]),
  );
  run(
    "cargo",
    [
      "test",
      "--jobs",
      "2",
      "-p",
      "deckcraft-engine",
      "--test",
      "host_session_reuse",
    ],
    {
      cwd: temporary,
      env: {
        ...process.env,
        CARGO_TARGET_DIR:
          process.env.CARGO_TARGET_DIR ||
          join(tmpdir(), "imageslide-deckcraft-native-check"),
      },
    },
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

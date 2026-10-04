---
name: verify-ui
description: Look at the sdash UI in a real browser before saying that a change to it works. Builds the binary, starts it without opening a browser on a free port, drives the page with Playwright, takes screenshots in the light and the dark theme, runs the axe scan and stops the server. Use after any change under web/, to the embedded files or to what the server sends the browser, and whenever asked to show or check how the UI looks.
---

<!-- SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Verify a UI change

The type check and the unit tests say that the code agrees with itself, not
that the page looks right or can be used. A UI change is verified when it has
been seen: in the built binary, in a real browser, in both themes, used by
keyboard, and without an axe violation
(`doc/adr/0014-accessibility-and-browsers.md`). Until the screenshots have
been read, the honest word is "unverified", not "works".

## Steps

1. **Build.** `make build` builds the frontend, copies it into
   `internal/static/dist/` and compiles `bin/sdash`. Look at the binary, not
   at the Vite development server: the binary serves the embedded build
   under its Content-Security-Policy, which is what a user gets
   (`doc/adr/0012-local-listener-security.md`).
2. **Have a browser.** Playwright's own Chromium comes from
   `npx playwright install chromium` in `web/`. Where that is not wanted,
   set `SDASH_CHROMIUM` to a Chromium on the machine, the variable the test
   configurations read too. With no browser at all, stop and report the
   change as unverified.
3. **Write the script** below as `look.mjs` into a directory that
   `mktemp -d` made, outside the checkout, and add what brings the page into
   the state the change is about. Use the keyboard for a control the change
   added. The directory has to be readable by its owner alone, which is what
   `mktemp -d` gives, because `sdash.log` in it holds the token of the
   launch.
4. **Start, look, stop** in one shell command, so that no server is left
   running. Port 0 has the system pick a free port. sdash prints
   `sdash is serving at` and its address, which carries the token of this
   launch: use the address as printed, hand it on in the environment and
   never as an argument, which every user of the host can read, and keep the
   token out of anything you report.

   ```sh
   out=/path/to/the/directory/of/step/3
   bin/sdash --no-browser --listen 127.0.0.1:0 > "$out/sdash.log" 2>&1 &
   pid=$!
   until grep -q '^sdash is serving at ' "$out/sdash.log"; do
     kill -0 "$pid" || { cat "$out/sdash.log"; exit 1; }
     sleep 0.2
   done
   address=$(sed -n 's/^sdash is serving at //p' "$out/sdash.log")
   (cd web && SDASH_URL="$address" node "$out/look.mjs" "$out")
   kill -TERM "$pid"; wait "$pid"; echo "sdash exited with $?"
   ```

   sdash exits with 0 on SIGTERM. Anything else is a finding.
5. **Read the screenshots.** Open `light.png` and `dark.png` and look at
   them: the change is there, nothing is clipped or overlaps, the text is
   legible in both themes, the focus ring shows where the script left the
   focus, and the result agrees with `doc/design/`, which is the reference
   for look and interaction and not for measurements.
6. **Read what the script printed.** A page error, a console error (the
   browser reports what the Content-Security-Policy refused there) and an
   axe violation are each a defect of the change, to be fixed and not
   excused.
7. **Run the committed suite.** `make test-browser` runs the Playwright
   tests of `web/e2e/` in Chromium, Firefox and WebKit. With `SDASH_CHROMIUM`
   alone, `npx playwright test --project chromium` in `web/` runs the
   Chromium leg, and CI runs the other two. A view the change added has its
   own axe scan there, in both themes.
8. **Report** what was looked at: the states, the themes, the engine, and
   what could not be looked at.

## The script

```js
// Run from web/, with the address sdash printed in the environment:
//   SDASH_URL=<address> node look.mjs <output directory>
import { createRequire } from "node:module";

// The packages are installed in web/, not beside this file.
const require = createRequire(`${process.cwd()}/`);
const { chromium } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");

const address = process.env.SDASH_URL;
const [out] = process.argv.slice(2);
const executablePath = process.env.SDASH_CHROMIUM;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let problems = 0;

for (const theme of ["light", "dark"]) {
  // A new context has no stored choice, so the page takes the theme the
  // system prefers, which colorScheme sets.
  const context = await browser.newContext({
    colorScheme: theme,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const report = (text) => {
    problems += 1;
    console.log(`${theme}: ${text}`);
  };
  page.on("pageerror", (error) => report(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") report(`console: ${message.text()}`);
  });

  await page.goto(address);
  await page.getByRole("heading", { level: 1 }).waitFor();

  // Bring the page into the state the change is about, here.

  await page.screenshot({ path: `${out}/${theme}.png`, fullPage: true });
  const applied = await page.locator("html").getAttribute("data-theme");
  if (applied !== theme) report(`data-theme is ${applied}`);
  const { violations } = await new AxeBuilder({ page }).analyze();
  for (const { id, help, nodes } of violations) {
    const where = nodes.map((node) => node.target.join(" ")).join(", ");
    report(`axe ${id}: ${help}: ${where}`);
  }
  await context.close();
}

await browser.close();
console.log(problems === 0 ? "no problems reported" : `${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
```

A state needs its own screenshot: take one after each step that changes
what the page shows, under a name that says which state it is.

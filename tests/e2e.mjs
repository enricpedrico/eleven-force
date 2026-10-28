const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3010";
const baseOrigin = new URL(baseUrl).origin;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const scope = process.env.E2E_SCOPE ?? "all";
const engine = process.env.E2E_ENGINE ?? "chromium";
const browser = await playwright[engine].launch({ ...(engine === "chromium" ? { executablePath: "/usr/bin/google-chrome" } : {}), headless: true });

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`${label} has ${overflow}px horizontal overflow`);
}

async function confirmPositionChangeIfNeeded(page) {
  const dialog = page.locator(".position-dialog");
  if (!await dialog.isVisible().catch(() => false)) return false;
  await dialog.getByRole("heading", { name: /Confirma el cambio de posición/i }).waitFor();
  if (await dialog.locator(".position-change-list article").count() < 2) throw new Error("Position confirmation does not explain the tactical change");
  await dialog.getByRole("button", { name: /Confirmar y fichar/i }).click();
  await dialog.waitFor({ state: "hidden" });
  return true;
}

async function runSolo(width, height, profile) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 600 });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  if (profile === "mobile") {
    await page.getByText("Jugar con amigos", { exact: true }).waitFor();
    await page.locator('.language-selector button').filter({ hasText: "CAT" }).click();
    await page.getByText("Jugar amb amics", { exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Jugar amb amics", { exact: true }).waitFor();
    await page.locator('.language-selector button').filter({ hasText: "EN" }).click();
    await page.getByText("Play with friends", { exact: true }).waitFor();
    await page.locator('.language-selector button').filter({ hasText: "ES" }).click();
  }
  await assertNoOverflow(page, `${profile} home`);
  await page.screenshot({ path: `/tmp/eleven-force-home-${profile}.png`, fullPage: true });
  await page.getByRole("button", { name: /Draft individual/i }).click();
  await assertNoOverflow(page, `${profile} setup`);
  if (!(await page.getByRole("button", { name: /Sin duplicados/i }).getAttribute("class"))?.includes("is-active")) throw new Error("Unique character rule is not enabled by default");
  await page.getByRole("button", { name: /^Blue Lock/i }).click();
  await page.getByRole("button", { name: /^Captain Tsubasa/i }).click();
  await page.getByRole("button", { name: /^Original/i }).click();
  await page.getByRole("button", { name: /^GO/i }).click();
  if (!(await page.getByRole("button", { name: /^Blue Lock/i }).getAttribute("class"))?.includes("is-active")) throw new Error("Blue Lock could not be selected");
  if (!(await page.getByRole("button", { name: /^Captain Tsubasa/i }).getAttribute("class"))?.includes("is-active")) throw new Error("Captain Tsubasa could not be selected");
  await page.getByRole("button", { name: profile === "mobile" ? /^Captain Tsubasa/i : /^Blue Lock/i }).click();
  if (await page.locator(".formation-options button").count() !== 10) throw new Error("Setup does not expose all ten formations");
  await page.getByRole("button", { name: "3 · 4 · 2 · 1", exact: true }).click();
  await page.getByRole("button", { name: /Iniciar draft/i }).click();
  for (let pick = 0; pick < 11; pick += 1) {
    await page.getByRole("button", { name: /Lanzar el dado/i }).click();
    await page.locator(".roll-result").waitFor();
    if (pick === 0) {
      const saga = await page.locator(".roll-result .kicker").textContent();
      await page.getByRole("button", { name: /Reroll/i }).click();
      if ((await page.locator(".roll-result .kicker").textContent()) !== saga) throw new Error("Solo reroll changed the locked season");
      await page.getByRole("button", { name: /Reroll/i }).click();
      if (!(await page.getByRole("button", { name: /Reroll/i }).isDisabled())) throw new Error("Solo mode allows more than two rerolls");
      const squadBeforeReload = await page.locator(".roll-result h2").textContent();
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Continuar draft/i }).click();
      if (await page.locator(".roll-result h2").textContent() !== squadBeforeReload) throw new Error("Reload changed the current squad");
      if (!(await page.getByRole("button", { name: /Reroll/i }).isDisabled())) throw new Error("Reload reset consumed rerolls");
      await assertNoOverflow(page, `${profile} draft`);
      const portrait = page.locator("button.player-card:not(:disabled) .pixel-portrait--official img").first();
      await portrait.waitFor();
      await page.waitForFunction((image) => image.complete && image.naturalWidth > 0, await portrait.elementHandle());
      await page.screenshot({ path: `/tmp/eleven-force-draft-${profile}.png`, fullPage: true });
    }
    await page.locator("button.player-card:not(:disabled)").first().click();
    await confirmPositionChangeIfNeeded(page);
  }
  await page.getByText("FINAL EN DIRECTO", { exact: true }).waitFor();
  if (await page.getByText("CAMPEÓN DEL TORNEO", { exact: true }).count()) throw new Error("The live final reveals the champion before the match ends");
  await page.locator(".broadcast-event__copy small").waitFor({ timeout: 7_000 });
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  const minuteBeforePause = Number.parseInt((await page.locator(".broadcast-score time").textContent()) ?? "0", 10);
  await page.waitForTimeout(350);
  const minuteAfterPause = Number.parseInt((await page.locator(".broadcast-score time").textContent()) ?? "0", 10);
  if (minuteAfterPause !== minuteBeforePause) throw new Error("The final broadcast did not pause");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await assertNoOverflow(page, `${profile} final broadcast`);
  await page.screenshot({ path: `/tmp/eleven-force-final-broadcast-${profile}.png`, fullPage: true });
  await page.getByRole("button", { name: "Saltar al resultado", exact: true }).click();
  await page.getByText("CAMPEÓN DEL TORNEO", { exact: true }).waitFor();
  if (await page.locator(".roster-list article").count() !== 11) throw new Error("The default final line-up does not show eleven players");
  await page.getByRole("tab", { name: "Comparativa", exact: true }).click();
  await page.getByRole("heading", { name: "Comparativa de medias", exact: true }).waitFor();
  if (await page.locator(".team-comparison-table tbody tr").count() !== 2) throw new Error("Solo comparison does not include both teams");
  await page.waitForTimeout(300);
  await assertNoOverflow(page, `${profile} result`);
  await page.screenshot({ path: `/tmp/eleven-force-result-${profile}.png`, fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Ver último resultado/i }).click();
  await page.getByText("CAMPEÓN DEL TORNEO", { exact: true }).waitFor();
  await context.close();
}

async function runAdmin() {
  if (!adminPassword) return;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  await assertNoOverflow(page, "admin login");
  await page.getByLabel("Contraseña administrativa").fill(adminPassword);
  await page.getByRole("button", { name: /Abrir panel/i }).click();
  await page.getByRole("heading", { name: "Estado del sistema" }).waitFor();
  await assertNoOverflow(page, "admin overview");
  await page.getByRole("button", { name: /Cartas/i }).click();
  const teamFilter = page.getByLabel("Filtrar por equipo");
  await teamFilter.selectOption({ index: 1 });
  await page.locator(".admin-team-heading").first().waitFor();
  if (await page.locator(".admin-team-heading").count() !== 1) throw new Error("Team filter shows more than one team group");
  await teamFilter.selectOption("");
  await page.getByLabel("Buscar personaje o equipo").fill("Mark Evans");
  const row = page.locator(".admin-player").first();
  await row.waitFor();
  const portrait = row.locator(".pixel-portrait--official img");
  await page.waitForFunction((image) => image.complete && image.naturalWidth > 0, await portrait.elementHandle());
  const rating = row.locator(".rating-input input");
  const original = await rating.inputValue();
  const replacement = original === "41" ? "42" : "41";
  const position = row.locator(".position-input select");
  const originalPosition = await position.inputValue();
  const originalPositions = {};
  for (const item of ["GK", "DF", "MF", "FW"]) {
    originalPositions[item] = (await row.locator(`.position-compatibility button:has-text("${item}")`).getAttribute("aria-pressed")) === "true";
  }
  const originalEnabled = (await row.getByRole("switch").getAttribute("aria-checked")) === "true";
  const wasOverridden = !(await row.getByTitle("Restaurar carta original").isDisabled());
  const replacementPosition = originalPosition === "FW" ? "MF" : "FW";
  await rating.fill(replacement);
  await position.selectOption(replacementPosition);
  if ((await row.locator(`.position-compatibility button:has-text("${replacementPosition}")`).getAttribute("aria-pressed")) !== "true") throw new Error("New primary position was not added to compatible positions");
  await row.getByRole("switch").click();
  await row.getByTitle("Guardar cambios de la carta").click();
  await page.getByText(/Cambios guardados para/).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Cartas/i }).click();
  await page.getByLabel("Buscar personaje o equipo").fill("Mark Evans");
  const persistedRow = page.locator(".admin-player").filter({ hasText: "Mark Evans" }).first();
  await persistedRow.waitFor();
  if ((await persistedRow.locator(".rating-input input").inputValue()) !== replacement) throw new Error("Admin rating did not persist");
  if ((await persistedRow.locator(".position-input select").inputValue()) !== replacementPosition) throw new Error("Admin position did not persist");
  if ((await persistedRow.locator(`.position-compatibility button:has-text("${replacementPosition}")`).getAttribute("aria-pressed")) !== "true") throw new Error("Admin compatible positions did not persist");
  if ((await persistedRow.getByRole("switch").getAttribute("aria-checked")) !== "false") throw new Error("Admin availability did not persist");
  await page.screenshot({ path: "/tmp/eleven-force-admin-disabled-mobile.png", fullPage: true });
  if (wasOverridden) {
    await persistedRow.locator(".rating-input input").fill(original);
    await persistedRow.locator(".position-input select").selectOption(originalPosition);
    for (const item of ["GK", "DF", "MF", "FW"]) {
      const toggle = persistedRow.locator(`.position-compatibility button:has-text("${item}")`);
      const selected = (await toggle.getAttribute("aria-pressed")) === "true";
      if (selected !== originalPositions[item]) await toggle.click();
    }
    if (((await persistedRow.getByRole("switch").getAttribute("aria-checked")) === "true") !== originalEnabled) await persistedRow.getByRole("switch").click();
    await persistedRow.getByTitle("Guardar cambios de la carta").click();
    await page.getByText(/Cambios guardados para/).waitFor();
  } else {
    await persistedRow.getByTitle("Restaurar carta original").click();
    await page.getByText(/Configuración original restaurada/).waitFor();
  }
  await assertNoOverflow(page, "admin ratings");
  await page.screenshot({ path: "/tmp/eleven-force-admin-mobile.png", fullPage: true });

  await page.getByRole("button", { name: /Tier list Comparación visual/i }).click();
  await page.locator(".tier-board").waitFor();
  const tierCard = page.locator(".tier-card").first();
  await tierCard.waitFor();
  const tierName = (await tierCard.locator("span strong").textContent())?.trim();
  const tierOriginal = Number(await tierCard.locator("b").textContent());
  if (!tierName || !Number.isInteger(tierOriginal)) throw new Error("Tier list card data is incomplete");
  const tierReplacement = tierOriginal === 99 ? tierOriginal - 1 : tierOriginal + 1;
  await tierCard.click();
  const exactRating = page.getByLabel(`Valoración exacta de ${tierName}`);
  await exactRating.fill(String(tierReplacement));
  if ((await exactRating.inputValue()) !== String(tierReplacement)) throw new Error("Tier list exact rating did not update");
  const saveTier = page.getByRole("button", { name: /^Guardar valoraciones$/i });
  const firstTierSave = page.waitForResponse((response) => response.url().endsWith("/api/admin/players/ratings") && response.request().method() === "PUT");
  await saveTier.click();
  await firstTierSave;
  const updatedTierCard = page.locator(".tier-card").filter({ hasText: tierName }).first();
  await updatedTierCard.waitFor();
  if (Number(await updatedTierCard.locator("b").textContent()) !== tierReplacement) throw new Error("Tier list rating did not persist");
  await updatedTierCard.click();
  await page.getByLabel(`Valoración exacta de ${tierName}`).fill(String(tierOriginal));
  const secondTierSave = page.waitForResponse((response) => response.url().endsWith("/api/admin/players/ratings") && response.request().method() === "PUT");
  await saveTier.click();
  await secondTierSave;
  await assertNoOverflow(page, "admin tier list");
  await page.screenshot({ path: "/tmp/eleven-force-admin-tier-mobile.png", fullPage: true });
  await context.close();

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  await desktopPage.getByLabel("Contraseña administrativa").fill(adminPassword);
  await desktopPage.getByRole("button", { name: /Abrir panel/i }).click();
  await desktopPage.getByRole("heading", { name: "Estado del sistema" }).waitFor();
  await desktopPage.getByRole("button", { name: /Cartas/i }).click();
  await desktopPage.getByRole("button", { name: /Tier list Comparación visual/i }).click();
  await desktopPage.locator(".tier-board").waitFor();
  const desktopTierCard = desktopPage.locator(".tier-card").first();
  const dragRating = Number(await desktopTierCard.locator("b").textContent());
  const dropLane = desktopPage.locator(dragRating >= 97 ? ".tier-lane--a" : ".tier-lane--legend");
  const dataTransfer = await desktopPage.evaluateHandle(() => new DataTransfer());
  await desktopTierCard.dispatchEvent("dragstart", { dataTransfer });
  await dropLane.dispatchEvent("dragover", { dataTransfer });
  await dropLane.dispatchEvent("drop", { dataTransfer });
  await desktopTierCard.dispatchEvent("dragend", { dataTransfer });
  await desktopPage.getByText("Cambios pendientes: 1", { exact: true }).waitFor();
  await assertNoOverflow(desktopPage, "admin tier list desktop");
  await desktopPage.screenshot({ path: "/tmp/eleven-force-admin-tier-desktop.png", fullPage: true });
  await desktopPage.getByRole("button", { name: /^Descartar$/i }).click();
  await desktopContext.close();
}

async function runMultiplayer() {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await hostContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseOrigin });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.goto(baseUrl, { waitUntil: "networkidle" });
  await host.getByRole("button", { name: /Jugar con amigos/i }).click();
  await host.getByLabel("Nombre de la sala").fill("E2E Invitaciones");
  await host.getByLabel("Tu nombre").fill("Maria");
  await host.getByRole("button", { name: /Final directa/i }).click();
  await host.getByRole("button", { name: /Crear sala/i }).click();
  await host.locator(".room-code-card").waitFor();
  const code = (await host.locator(".room-code-card > strong").textContent()).trim();
  await host.getByRole("button", { name: "Copiar código", exact: true }).click();
  await host.getByText("Código copiado", { exact: true }).waitFor();
  if (await host.evaluate(() => navigator.clipboard.readText()) !== code) throw new Error("Copy code did not write the room code");
  await host.getByRole("button", { name: "Copiar enlace", exact: true }).click();
  await host.getByText("Enlace copiado", { exact: true }).waitFor();
  const inviteLink = await host.evaluate(() => navigator.clipboard.readText());
  if (inviteLink !== `${baseOrigin}/?room=${code}`) throw new Error("Copy link did not write the direct room URL");
  await guest.goto(inviteLink, { waitUntil: "networkidle" });
  await guest.getByText("INVITACIÓN DIRECTA", { exact: true }).waitFor();
  if (await guest.getByLabel("Código de sala").count()) throw new Error("Direct invitations still ask for the room code");
  await assertNoOverflow(guest, "direct room invitation");
  await guest.screenshot({ path: "/tmp/eleven-force-direct-invite-mobile.png", fullPage: true });
  await guest.getByLabel("Tu nombre").fill("Jorge");
  await guest.getByRole("button", { name: /Entrar al vestuario/i }).click();
  await guest.locator(".room-code-card").waitFor();
  await guest.getByText(/Personajes únicos activados/i).waitFor();
  await assertNoOverflow(guest, "multiplayer lobby");
  await host.getByRole("button", { name: /Marcar como preparado/i }).click();
  await guest.getByRole("button", { name: /Marcar como preparado/i }).click();
  await host.getByText("Jorge", { exact: false }).first().waitFor();
  await host.screenshot({ path: "/tmp/eleven-force-lobby-mobile.png", fullPage: true });
  await host.getByRole("button", { name: /Empezar draft/i }).click();

  let firstTurn = true;
  for (let pick = 0; pick < 22; pick += 1) {
    const expectedName = pick % 2 === 0 ? "Maria" : "Jorge";
    const actor = expectedName === "Maria" ? host : guest;
    if (pick === 1) await hostContext.setOffline(true);
    await actor.locator(".turn-indicator strong").filter({ hasText: expectedName }).waitFor();
    await actor.getByRole("button", { name: /Lanzar el dado/i }).click();
    await actor.locator(".roll-result").waitFor();
    if (firstTurn) {
      const saga = await actor.locator(".roll-result .kicker").textContent();
      await actor.getByRole("button", { name: /Reroll/i }).click();
      await actor.locator(".reroll-button span").getByText("1 restantes", { exact: true }).waitFor();
      if ((await actor.locator(".roll-result .kicker").textContent()) !== saga) throw new Error("Multiplayer reroll changed the locked season");
      await actor.getByRole("button", { name: /Reroll/i }).click();
      await actor.locator(".reroll-button span").getByText("0 restantes", { exact: true }).waitFor();
      if (!(await actor.getByRole("button", { name: /Reroll/i }).isDisabled())) throw new Error("Multiplayer allows more than two rerolls");
      await assertNoOverflow(actor, "multiplayer draft");
      await actor.screenshot({ path: "/tmp/eleven-force-multiplayer-draft-mobile.png", fullPage: true });
      firstTurn = false;
    }
    await actor.locator("button.player-card:not(:disabled)").first().click();
    await confirmPositionChangeIfNeeded(actor);
    await actor.waitForFunction((currentName) => {
      const error = document.querySelector(".form-error");
      const nextName = document.querySelector(".turn-indicator strong")?.textContent;
      return Boolean(error) || nextName !== currentName;
    }, expectedName, { timeout: 12_000 });
    const errorLocator = actor.locator(".form-error");
    const actionError = await errorLocator.count() ? await errorLocator.textContent() : null;
    if (actionError) throw new Error(`Multiplayer pick ${pick + 1} failed for ${expectedName}: ${actionError}`);
    if (pick === 1) {
      await hostContext.setOffline(false);
      await host.locator(".connection-notice").waitFor({ state: "hidden", timeout: 20_000 });
      await host.locator(".turn-indicator strong").filter({ hasText: "Maria" }).waitFor();
    }
  }
  await host.getByText("FINAL EN DIRECTO", { exact: true }).waitFor({ timeout: 20_000 });
  await guest.getByText("FINAL EN DIRECTO", { exact: true }).waitFor({ timeout: 20_000 });
  await host.getByRole("button", { name: "Saltar al resultado", exact: true }).click();
  await guest.getByRole("button", { name: "Saltar al resultado", exact: true }).click();
  await host.getByText("CAMPEÓN DEL TORNEO", { exact: true }).waitFor();
  await guest.getByText("CAMPEÓN DEL TORNEO", { exact: true }).waitFor();
  await host.locator(".team-picker button").filter({ hasText: "Jorge" }).click();
  await host.locator(".roster-sheet h3").getByText("Jorge", { exact: true }).waitFor();
  if (await host.locator(".roster-list article").count() !== 11) throw new Error("Selected final squad does not show all eleven players");
  await host.getByRole("tab", { name: "Comparativa", exact: true }).click();
  await host.getByRole("heading", { name: "Comparativa de medias", exact: true }).waitFor();
  if (await host.locator(".team-comparison-table tbody tr").count() !== 2) throw new Error("Final comparison does not include every participant");
  await host.waitForTimeout(600);
  await assertNoOverflow(host, "multiplayer result");
  await host.screenshot({ path: "/tmp/eleven-force-multiplayer-result-mobile.png", fullPage: true });
  await hostContext.close();
  await guestContext.close();
}

try {
  if (scope === "all" || scope === "solo") {
    await runSolo(390, 844, "mobile");
    await runSolo(1440, 1000, "desktop");
  }
  if (scope === "all" || scope === "multiplayer") await runMultiplayer();
  if (scope === "all" || scope === "admin") await runAdmin();
  console.log(`E2E complete: ${scope} passed.`);
} finally {
  await browser.close();
}

# Eleven Force

Simulador fan de draft futbolístico para `7a0.pedrico.cat`. Incluye partida individual, salas temporales sin cuenta, draft por turnos, final directa, copa con CPU y simulación determinista.

## Catálogo y valoraciones

El catálogo de producción contiene 186 equipos, 2.756 variantes de carta y 1.778 identidades de personaje de siete etapas: Original, GO, Ares, Orion, Victory Road, Blue Lock y Captain Tsubasa. Los nombres, equipos y posiciones se contrastan con los directorios oficiales y las bases documentales indicadas en los manifiestos del catálogo. No se copian descripciones ni estadísticas de esos sitios.

Original incluye 33 plantillas. La ampliación añade Occult, Wild, Brainwashing, Otaku, Shuriken, Farm, Kirkwood, Alpine, Cloister Divinity, Mary Times, Secret Service, Royal Academy Redux, Neo National, Desert Lions y Knights of Queen.

La puntuación es propia y reproducible, con rango 60-97:

- El nivel competitivo de la plantilla establece la base.
- Las distintas etapas de un personaje pueden tener valoraciones diferentes.
- Las figuras canónicas tienen anclas narrativas revisadas manualmente.
- Cada saga limita las identidades a un máximo de 2 con 97, 2 con 96, 3 con 95, 4 con 94, 5 con 93, 7 con 92, 9 con 91, 12 con 90, 16 con 89 y 22 con 88.
- El informe reproducible queda en `shared/rating-report.json`.
- La simulación no usa solo la media: separa portería, defensa, medio, ataque, química elemental y táctica.

Después de modificar o regenerar datos, la escala se reaplica y valida con:

```bash
npm run ratings:rebalance
```

Los personajes utilizan retratos WebP conservados localmente para no depender de una API o CDN durante el juego; el SVG procedural sigue disponible como fallback. El sincronizador valida el host, el tipo de contenido y el tamaño antes de guardar cada archivo:

```bash
npm run sync:portraits
```

Los retratos y nombres pertenecen a sus respectivos titulares y se usan exclusivamente en este proyecto fan personal y no comercial.

## Desarrollo

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
```

El servidor usa `PORT=3010` y `DATABASE_PATH=./data/eleven-force.sqlite` por defecto. Las salas y sesiones expiran a las seis horas.

## Continuidad Y Selección

El draft individual se guarda automáticamente en este navegador (una partida, incluyendo cartas, formación, semilla, rerolls consumidos y resultado). La portada permite retomarlo; iniciar otro draft pide confirmación si todavía está en curso. No se sincroniza entre dispositivos. Si el navegador bloquea el almacenamiento, el juego continúa con un aviso y sin prometer recuperación.

La selección permite buscar por nombre, filtrar por cualquiera de las posiciones compatibles y mostrar u ocultar las cartas no fichables. En móvil, la alineación se despliega bajo demanda. El modo memoria oculta las valoraciones tanto en las cartas como en el campo hasta la final.

Las salas vuelven a consultar su estado al reconectar, ignoran versiones antiguas y bloquean acciones mientras no se haya recuperado la conexión. Si falla la carga del catálogo, se pide reintentar en lugar de jugar silenciosamente con las valoraciones originales.

Las excepciones de retratos por versión se documentan en `shared/portrait-variants.json`. Ares/Orion usan el retrato joven de Xavier Schiller, no la coincidencia adulta de GO. El sincronizador conserva estas excepciones y sus fuentes oficiales.

Pruebas adicionales de producto: `node tests/product-e2e.mjs` (servidor aislado por defecto en `http://127.0.0.1:3011`). Admiten `BASE_URL`, `E2E_ENGINE` y `PLAYWRIGHT_MODULE`; `AXE_MODULE` permite añadir la auditoría de accesibilidad. Las pruebas administrativas deben ejecutarse solo contra una base de datos de prueba.

## Administración

El panel está disponible únicamente en `/admin`. Permite buscar las 2.756 variantes de carta y editar de forma independiente su puntuación, posición principal, posiciones compatibles y disponibilidad dentro de cada equipo. Las valoraciones también tienen una vista tier list por equipo, usable con toque o teclado y con arrastre opcional en escritorio; los cambios se revisan antes de guardarse juntos en una transacción. Las cartas desactivadas no aparecen en drafts ni equipos CPU, pero otras versiones del mismo personaje siguen disponibles. También permite importar/exportar todos los ajustes, consultar salud y almacenamiento, limpiar sesiones caducadas y cerrar salas activas.

Durante el draft, el sistema puede recolocar el mínimo número de jugadores polivalentes para abrir una plaza, pero siempre exige confirmación antes de aplicar el cambio. Cada participante también puede ajustar manualmente sus posiciones mientras exista una plaza libre en la formación.

La contraseña no se guarda en texto plano. En producción se establece interactivamente desde el directorio desplegado:

```bash
sudo ./scripts/set-admin-password.sh
```

El panel usa una cookie separada `Secure`/`HttpOnly`/`SameSite=Strict`, CSRF, validación de origen y un límite específico de intentos de acceso.

## Producción

```bash
docker compose up -d --build
```

El contenedor publica únicamente `127.0.0.1:18084`. Caddy usa el bloque de `ops/Caddyfile.snippet`. En DNS se necesita `CNAME 7a0 -> pedrico.cat.`.

## Privacidad

No hay cuentas, analítica, anuncios ni recursos de terceros. El modo individual no sale del navegador. El multijugador conserva temporalmente nombre, equipo y resultado, usa cookie técnica `Secure`/`HttpOnly`/`SameSite=Strict` y elimina la sala al caducar.

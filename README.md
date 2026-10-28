# Eleven Force

Simulador de draft futbolístico, salas y modo individual.

- Draft de personajes de fútbol, modo individual y salas temporales sin cuenta.
- Catálogo por equipos y sagas, posiciones compatibles y simulación reproducible.
- Administración protegida para ajustar valoraciones, catálogo y salas.

## Estado del repositorio

Repositorio **privado** con código y recursos necesarios para reconstruir la aplicación. La base se ha contrastado con los archivos del servidor el 28 de octubre de 2026. No incluye el historial de despliegues ni datos persistentes.

## Desarrollo

Node.js 24 LTS y npm; las versiones exactas se fijan en `package-lock.json`.

```bash
npm ci
npm run dev
```

## Configuración

Copia `.env.example` a `.env` y sustituye los valores de ejemplo. Nunca subas `.env`. Variables documentadas:

- `ADMIN_PASSWORD_HASH`

## Estructura

`src/`: interfaz de usuario; `public/`: recursos estáticos; `tests/`: pruebas. `server/`: API y persistencia; `shared/`: contratos y lógica compartida.

## Verificación

```bash
npm run typecheck
npm test
npm run build
```

## Despliegue y datos

La configuración Compose del repositorio es la referencia. Prepara las variables y el directorio de datos, después ejecuta `docker compose up -d --build`. Los puertos de la aplicación deben permanecer ligados a loopback, detrás del proxy HTTPS.

No se han incluido `.env`, tokens, contraseñas, sesiones, bases de datos, archivos subidos, biblioteca multimedia, cachés o copias de seguridad. Las copias de datos se gestionan aparte; subir el código no sustituye un respaldo. Antes de actualizar una instalación conserva sus datos y configuración. No uses `docker compose down -v` para una actualización normal.

## Seguridad

Revisión del 28 de octubre de 2026: correcciones y pruebas en este repositorio privado; no se han desplegado en el servidor. Consulta [SECURITY.md](SECURITY.md) para los controles, los límites conocidos y la preparación del despliegue. Tener administración protegida no exige que el código sea privado.

## Documentación original

[README original](README.original.md), conservado con los detalles de funcionamiento y las instrucciones específicas del proyecto. Se conservan los avisos de terceros incluidos; no se ha añadido una licencia nueva.

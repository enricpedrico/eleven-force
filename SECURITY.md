# Seguridad de Eleven Force

Revisión: 28 de octubre de 2026. Cambios preparados en el código y el repositorio privado; no desplegados en producción. La privacidad del repositorio no sustituye los controles de acceso.

## Controles y correcciones

- Las salas requieren una sesión perteneciente a esa sala. Las operaciones protegidas exigen CSRF; se rechazan orígenes ajenos. Las cookies son HttpOnly y SameSite=Strict; en producción también Secure.
- La administración permanece desactivada sin un hash válido en `ADMIN_PASSWORD_HASH`. Las sesiones administrativas son independientes y el acceso tiene límite de intentos.
- Las cookies con objetos JSON o formatos inválidos se tratan como no autenticadas. Un verificador de contraseña dañado se rechaza; solo `null` representa una sala sin contraseña. No se reutilizan códigos aún retenidos en SQLite.
- Respuestas API con `Cache-Control: no-store`; errores JSON de tamaño o sintaxis y fallos de almacenamiento sin detalles internos. Peticiones JSON limitadas a 32 KiB.
- Máximo 500 salas activas y 256 conexiones SSE en total, con cuatro por miembro y sala. Los SSE se liberan al desconectar y al caducar la sala. Llegar al límite rechaza nuevas operaciones y conserva los datos existentes.
- El servidor independiente y Vite escuchan por defecto en loopback. Dentro de Docker se usa `BIND_ADDRESS=0.0.0.0`; Compose publica únicamente en `127.0.0.1`, detrás de HTTPS.
- Dependencias npm actualizadas y fijadas en el lockfile. Se utiliza Node.js 24 LTS. Node.js 20 ya está fuera de soporte según el [calendario oficial](https://nodejs.org/en/about/previous-releases).
- El descargador de retratos, una herramienta de mantenimiento local, solo admite HTTPS y hosts previstos, rechaza redirecciones, limita tiempo y bytes durante la lectura y valida nombres de archivo. No es una ruta pública de la API.
- `.env`, bases de datos, claves y datos persistentes están excluidos de Git y del contexto Docker. La imagen se ejecuta como usuario sin privilegios y admite el sistema de archivos de solo lectura de Compose.

## Verificación de esta revisión

- `npm run typecheck`, `npm test` (48 pruebas) y `npm run build` pasan en Node.js 24.
- `npm audit --json`: cero avisos, incluyendo dependencias de desarrollo, a la fecha de revisión. Antes: 12 avisos.
- Pruebas de pertenencia a salas, CSRF, origen, cookies malformadas, hash inválido, errores JSON, capacidad y conexiones SSE reales.
- Imagen Docker de producción construida y probada de forma aislada: arranque, recursos JS/CSS, administración cerrada sin configuración, atributos de cookies y ausencia de caché en la API.
- Gitleaks sobre todo el historial exportado y el árbol de publicación: sin credenciales confirmadas. Los avisos `generic-api-key` del catálogo son identificadores públicos `characterKey`, revisados manualmente; no se han ocultado mediante exclusiones generales.

## Antes de hacer público y desplegar

1. Conservar la configuración privada y respaldar SQLite. Desplegar estos cambios en el servidor y comprobar una sala y la administración mediante HTTPS antes de cambiar la visibilidad de GitHub.
2. Usar Node.js 24 o reconstruir la imagen. Conservar las restricciones y el puerto loopback de Compose. Revisar el usuario de la imagen y la propiedad del directorio `data` al preparar un volumen nuevo; no cambiar permisos de datos existentes sin comprobarlos.
3. Generar un hash mediante `npm run hash:admin` si se quiere habilitar la administración. Guardarlo en `.env`, nunca en Git. Usar una contraseña larga y exclusiva. No exponer el servidor de desarrollo.
4. Revisar periódicamente dependencias y alertas de GitHub. No publicar futuros respaldos, datos de usuarios ni secretos.

## Alcance y límites

Se han revisado autenticación, sesiones, entradas HTTP, SQL, recursos persistentes, descargas de mantenimiento, configuración y dependencias del código exportado. No es una auditoría completa del sistema operativo, del proxy en funcionamiento, de la red ni una prueba de penetración de producción. Los límites reducen el abuso de recursos; una aplicación pública sigue necesitando protección del proxy ante tráfico abusivo. Las salas sin contraseña pueden ser compartidas por quien conozca su código.

Para comunicar una vulnerabilidad, usar un canal privado o la notificación privada de seguridad de GitHub si se habilita. No incluir credenciales ni datos personales en un issue público.

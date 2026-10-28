# Inspección de producto: Eleven Force

Revisión del 5 de septiembre de 2026. Se conserva la identidad retro, el catálogo, la simulación y los ajustes administrativos existentes.

## Problemas corregidos

- **Continuidad del draft individual.** Antes, salir o recargar perdía todas las elecciones. Ahora se guarda una partida local validada con semilla, formación, cartas, rerolls y resultado. La portada permite retomarla. Sustituir una partida en curso exige confirmación. El almacenamiento bloqueado muestra un aviso sin impedir jugar.
- **Editor administrativo.** Al cambiar filtros, equipo o vista podían mantenerse cartas de una consulta anterior. Ahora solo son editables las cartas correspondientes a la selección actual; las respuestas obsoletas no reemplazan la consulta reciente.
- **Recuperación multijugador.** Cada reconexión consulta el estado actual, descarta versiones antiguas y evita acciones duplicadas o durante una desconexión. Volver de modo avión recrea explícitamente la conexión.
- **Modo memoria.** También oculta las valoraciones del campo, que antes revelaban las puntuaciones de los jugadores ya fichados.
- **Selección móvil.** La alineación completa ya no desplaza las cartas una pantalla hacia abajo: se expande cuando se necesita. Hay búsqueda por nombre, filtros que incluyen posiciones secundarias y un control para mostrar cartas bloqueadas. Los nombres largos pueden ocupar varias líneas.
- **Retrato de Xavier.** La coincidencia por nombre encontraba primero la versión adulta de GO. Ares y Orion usan ahora el retrato de la etapa Ares, mediante una excepción explícita por carta y un archivo nuevo para evitar la caché de la imagen anterior. No cambia Xavier Foster de Original.
- **Resultados y navegación.** El último resultado se recupera sin obligar a repetir la retransmisión ya vista; se puede volver a verla, repetir el draft o cambiar su configuración. Los diálogos contienen el foco, admiten Escape y permiten desplazamiento en pantallas pequeñas.
- **Catálogo y dependencias.** Una carga fallida de ajustes ya no restaura silenciosamente las valoraciones base. Se ofrece reintentar. Se actualiza `qs` a su versión corregida `6.16.0`.

## Verificación

- TypeScript, build y 38 pruebas unitarias/API correctas.
- Partidas individuales completas, rerolls, recuperación, retransmisión, plantillas y comparación final en Chromium, Firefox y WebKit, con tamaños móvil y escritorio.
- Multijugador de 22 elecciones, invitaciones por código/enlace, reconexión después de perderse un turno y final compartida.
- Edición administrativa de valoración, posición, disponibilidad y tier list, incluyendo arrastre, exclusivamente en bases de datos de prueba.
- Regresión específica del admin con consultas retenidas y respuestas entregadas fuera de orden.
- Retrato correcto, filtros, modo memoria, guardado restringido, foco y diálogos a 320/390 píxeles en los tres motores de navegador.
- Auditoría automatizada de accesibilidad de la configuración: sin incidencias detectadas en los tres motores. No sustituye una auditoría manual completa de toda la aplicación.
- Auditoría npm: sin vulnerabilidades detectadas en la revisión.

WebKit se ha probado por automatización en Linux; no se ha utilizado un iPhone físico. El guardado individual es de una sola partida, local al navegador, sin sincronización entre dispositivos. Estas mejoras no convierten la aplicación en un servicio offline.

## Fuentes de la corrección del retrato

- Player Codex oficial: https://zukan.inazuma.jp/en/chara_param/?name_filter=Xavier%20Schiller
- Retrato de Alia Academy, Ares: https://dxi4wb638ujep.cloudfront.net/1/k/f/c/fcp_67ctsa8.webp
- Excepciones versionadas y procedencia: `shared/portrait-variants.json`.

No se ha ejecutado el reequilibrado del catálogo ni se han sobrescrito los ajustes de producción. La publicación conserva copia consistente de SQLite, configuración y versión anterior de la aplicación.

## Publicación verificada

Versión publicada en `https://7a0.pedrico.cat/` el 5 de septiembre de 2026. HTTPS y cabeceras de seguridad correctas, healthcheck correcto y 186 equipos disponibles. Los **163 ajustes manuales** de producción coinciden exactamente con la instantánea anterior. La imagen pública corregida coincide byte a byte con el recurso validado. El flujo individual completo también pasa contra la web pública.

La carta `ares-alia-academy-4556` estaba desactivada por un ajuste administrativo en producción y permanece desactivada. No se reactiva para satisfacer una prueba: su retrato queda corregido para el panel y para cuando se vuelva a habilitar. La prueba pública del retrato utiliza la versión de Orion, que sí está disponible.

# CUADERNO EF/PSICO — Especificación v2 para Claude Code

App personal de gestión docente que **sustituye a Additio con paridad funcional completa y experiencia superior**, para un único usuario: maestro especialista de EF (Primaria 1º–6º) y Psicomotricidad (Infantil 3–5 años) en un CEIP público bilingüe de Madrid. ~9 grupos, 20–25 alumnos/grupo (~200 alumnos). Uso principal: móvil Android en pista/porche, a menudo sin cobertura; uso secundario en escritorio. Las calificaciones oficiales se trasladan a mano a Raíces; esta app es el cuaderno de trabajo diario.

**Si existe código previo en el proyecto:** antes de escribir nada, audita lo existente contra esta spec (módulo a módulo y contra §3 DISEÑO), presenta qué se conserva / se refactoriza / se rehace, y espera aprobación.

---

## 1. RESTRICCIONES NO NEGOCIABLES (privacidad)

1. **Local-first estricto.** Todos los datos en IndexedDB del dispositivo. Sin backend, sin cuentas, sin telemetría, sin fuentes ni scripts de CDN en runtime (bundle 100 % autocontenido).
2. **Ningún dato identificativo sale del dispositivo en claro.** Solo tres llamadas de red permitidas: (a) API de Anthropic para el agente de voz (§6), siempre con texto pseudonimizado; (b) el servidor WebDAV propio del usuario (§10) y (c) Firestore (§11), ambos **únicamente** para transportar ficheros de backup ya cifrados. Cualquier otra petición de red está prohibida.
3. API key de Anthropic: la introduce el usuario en Ajustes, se guarda solo en local, jamás en código ni repo. Mismo trato para las credenciales del WebDAV y para el identificador y la passphrase de sincronización (§11).
4. Backups siempre cifrados (AES-GCM, WebCrypto; PBKDF2-SHA256 ≥600k iteraciones). Informes PDF/CSV/XLSX se generan en local bajo acción explícita.
5. Sin fotos ni audio de alumnos.
6. Campo `apoyos`: aviso en UI («sin diagnósticos, solo pautas prácticas»); excluido de todo informe exportable.
7. PIN de acceso (4–6 dígitos), bloqueo tras 5 min. El PIN protege el acceso a la interfaz; **no** cifra la base local (documentado en la propia UI de Ajustes).

**Exclusiones deliberadas respecto a Additio (no implementar):** comunicación con familias/alumnado (canal oficial: Roble), quizzes para alumnado (no hay dispositivos de alumnos en EF), sincronización en la nube **de datos legibles** —no hay servidor de la app, ni cuentas, ni mezcla de registros: solo el fichero `.enc` opaco de §10 y §11—, integraciones Classroom/Moodle/Drive.

## 2. STACK

React 18 + TypeScript + Vite · PWA (`vite-plugin-pwa`, offline total, instalable) · Dexie con migraciones · Tailwind (solo como motor de utilidades sobre los tokens de §3) · Zustand · jsPDF + jspdf-autotable (PDF) · SheetJS (XLSX) · Fuse.js (fuzzy) · Vitest solo para: motor de notas, fórmulas, conversión oficial, parser del agente, cifrado. Deploy: estático (GitHub Pages y localhost).

## 3. DISEÑO — SISTEMA OBLIGATORIO

Identidad: herramienta profesional de un docente de Educación Física. Limpia, contundente, deportiva. **Nunca** estética genérica de plantilla (Bootstrap/Material por defecto, gradientes decorativos, grises puros de Tailwind, emojis como iconos). Iconos: `lucide-react`.

### 3.1 Tokens de color (únicos permitidos; definir en `src/styles/tokens.css` y consumir SIEMPRE vía tokens, jamás hex sueltos en componentes)

| Token | Hex | Uso |
|---|---|---|
| `--primary` | `#006A80` | Navegación, botones primarios, enlaces, foco, cabeceras |
| `--accent` | `#CE184B` | Estado activo, énfasis, avisos importantes, negativo/falta. Nunca en fondos grandes |
| `--positive` | `#ABB200` | Éxito: presente, chándal OK, «conseguido», rachas positivas |
| `--bg` | `#F3F3EC` | Fondo base de la app |
| `--soft` | `#9AC3CC` | Superficies suaves, chips, hover, cabeceras de tabla, sello de etapa Infantil |
| `--surface` | `#FFFFFF` | Tarjetas |
| `--ink` | `#16333A` | Texto principal (derivado del primario, no negro puro) |

- Estados intermedios (retraso, «en proceso», advertencias) se derivan **mezclando u oscureciendo la paleta** (p. ej. `#ABB200` oscurecido), documentados como tokens; prohibido introducir familias de color ajenas.
- Modo oscuro: fondos derivados del primario (p. ej. `#062830` / `#0B3540`), texto `#F3F3EC`, mismos acentos. Conmutable en Ajustes.
- Contraste AA mínimo en todo texto; foco de teclado visible.

### 3.2 Tipografía y componentes

- Fuente empaquetada en el bundle (una variable sans legible, p. ej. Inter local) o system stack; **jamás desde CDN**. Números tabulares (`tabular-nums`) en cuaderno, asistencia y notas.
- Jerarquía: display 700 para títulos de pantalla; 600 para cabeceras de tarjeta; 400/500 cuerpo. Sentence case, español, verbos activos («Guardar cambios», no «Enviar»).
- Firma visual: separador «doble línea de pista» (dos filetes finos en `--soft`) bajo los títulos de sección, como las líneas de un campo deportivo. Es el único adorno; todo lo demás, sobrio.
- Radios en 3 escalones, ningún valor suelto fuera de ellos: 12 px (`rounded-xl`) en controles — botón, campo, chip rectangular —; 20 px (`rounded-xl2`) en tarjetas, paneles y hojas; completo (`rounded-full`) en píldoras y avatares. Sombras mínimas; chips de estado con icono + color de token.
- Targets táctiles ≥48 px; en «modo pista» (toggle) ≥64 px y contraste reforzado para sol directo.

## 4. MODELO DE DATOS (Dexie)

```ts
CursoEscolar { id, nombre: "2026-2027", activo, trimestres: {n, inicio, fin}[], festivos: fecha[] }
Grupo { id, cursoEscolarId, nombre, etapa: 'infantil'|'primaria', nivel, color, orden,
        horario: {diaSemana, horaInicio, horaFin}[] }
Alumno { id, grupoId, nombre, apellidos, alias, activo, apoyos?, notasPrivadas? }
Asistencia { id, alumnoId, fecha, estado: 'presente'|'falta'|'retraso'|'justificada',
             chandal: boolean, observacion? }
Sesion { id, grupoId, fecha, titulo, udId?, juegos: {gameId, nombre}[], notas,
         valoracion?: 1|2|3|4|5, recursos: {tipo:'enlace'|'nota', valor}[] }
Observacion { id, alumnoId?, grupoId, fecha, tipo: 'conducta'|'aprendizaje'|'salud'|'otro',
              signo: '+'|'-'|'neutro', texto, tags: string[] }
Evento { id, fecha, hora?, titulo, tipo: 'evento'|'reunion'|'recordatorio', avisoLocal: boolean }

// ——— PRIMARIA ———
UnidadDidactica { id, nivel, trimestre, titulo, criterios: string[], plantillaId? }
InstrumentoEval { id, udId, tipo: 'rubrica'|'lista_control'|'nota_directa',
                  fuente: 'docente'|'autoevaluacion'|'coevaluacion',
                  items: {id, descripcion, criterioCodigo, pesoPct}[], escala: {min,max},
                  formula?: string }   // media | ponderada | condicional | redondeo
Calificacion { id, alumnoId, instrumentoId, itemId, valor, trimestre, fecha }
EvalTrimestral { id, alumnoId, trimestre, notaCalculada, notaDocente?,
                 calificacionOficial: 'IN'|'SU'|'BI'|'NT'|'SB', comentario, cerrado }
EvalFinal { id, alumnoId, notaCalculada, notaDocente?, calificacionOficial, comentario }

// ——— INFANTIL ———
RegistroInfantil { id, alumnoId, criterioCodigo, momento: 1|2|3,
                   nivel: 'iniciado'|'en_proceso'|'conseguido', observacion? }
InformeInfantil { id, alumnoId, trimestre, comentario }

// ——— COMÚN ———
ComentarioBanco { id, texto /* placeholders {nombre} */, categoria, etapa }
Equipo { id, grupoId, nombre, miembros: alumnoId[], fecha }        // agrupamientos guardados
Config { pesosTrimestres, modoMedia: 'aritmetica'|'ponderada'|'continua', bandasOficiales,
         pin, apiKey?, modeloAgente, modoPista, temaOscuro }
AccionAgente { id, timestamp, transcripcion, accion, payload, estado: 'aplicada'|'deshecha' }
```

**Seeds legales:** `seeds/criterios_primaria.json` (EF, Decreto 61/2022, por ciclo, con código/texto/competencia) y `seeds/criterios_infantil.json` (Área I, Decreto 36/2022). Estructura completa con placeholders: **NO inventar textos legales**; el usuario aportará los oficiales.

## 5. MÓDULOS — PARIDAD ADDITIO MEJORADA

Navegación inferior: **Hoy · Cuaderno · Grupos · Planificador · Más** (Evaluación final, Informes, Calendario, Herramientas, Ajustes) + FAB de micrófono global.

Mapa de paridad (Additio → esta app):

| Additio | Aquí, mejorado |
|---|---|
| Cuaderno de notas con pestañas y fórmulas | M5 Cuaderno-rejilla táctil con fórmulas y colores condicionales |
| Asistencia con iconos y estadísticas | M2 pase de lista en <30 s + control de chándal |
| Planificador por sesiones y unidades con plantillas | M3 + plantillas de UD y sesión + Banco de Juegos integrado |
| Rúbricas personalizables, auto/coevaluación | M5 rúbricas ligadas a criterios, fuente docente/auto/co |
| Evaluación por competencias LOMLOE + currículo oficial | Seeds Decretos 61/2022 y 36/2022, informes por criterio/competencia |
| Positivos y negativos | Observaciones con signo + contadores rápidos en la vista de grupo |
| Horario, calendario, plano de clase | M8 horario+calendario con avisos; agrupamientos/equipos (más útil en EF que un plano de pupitres) |
| Informes personalizados, export Excel/PDF | M7 PDF + XLSX + CSV, plantillas de informe |
| Offline y sincronización | Offline total; export/import cifrado entre dispositivos, a mano o vía WebDAV propio (§10) |
| Recursos vinculados | Enlaces y notas por sesión/UD (sin nubes de terceros) |

### M1 Grupos y alumnos
Alta de grupos con etapa/nivel; badge visual permanente Infantil/Primaria. Importación de alumnado pegando lista o CSV en un paso. Ficha de alumno: % asistencia, rachas de chándal, contadores +/−, últimas observaciones, evolución de notas, `apoyos`.

### M2 Pase de lista (grupo completo <30 s)
«Todos presentes» + excepciones. Grid de tarjetas: tap cicla estado; icono camiseta = chándal; long-press = detalle. Iconografía de estados con tokens (`--positive` presente, `--accent` falta). Estadísticas por alumno y grupo; la asistencia puede alimentar fórmulas del cuaderno. «Hoy» abre la lista del grupo que toca según horario.

### M3 Planificador
Vista semanal según horario + lista por UD. Sesión = grupo+fecha+juegos+notas+valoración+recursos. **Plantillas** de sesión y de UD reutilizables entre niveles (esqueleto escalable, clave para 9 grupos). Import del Banco de Juegos (JSON `GAMES`) con buscador y filtros; añadir juego a sesión en 2 taps. Duplicar sesión/UD a otro grupo o nivel.

### M4 Observaciones
Registro en ≤3 taps: alumno → chips tipo/signo → texto (dictado del teclado) → guardar. Quick-tags configurables. Contadores +/− visibles en la vista de grupo (paridad «positivos y negativos»). Timeline filtrable por alumno/grupo/tipo.

### M5 Cuaderno y evaluación PRIMARIA
- **Vista Cuaderno (central):** rejilla táctil por grupo y trimestre — filas alumnos (columna congelada), columnas ítems/instrumentos agrupados por UD. Celdas con color condicional por tokens (p. ej. <5 en `--accent`). Entrada por tap con teclado numérico grande; navegación por columna para evaluar a toda la clase seguida; deshacer.
- Instrumentos: rúbrica (editor), lista de control, nota directa; fuente docente/auto/coevaluación; cada ítem liga a criterio y peso.
- **Fórmulas por columna:** media, ponderada, redondeos, condicionales simples («si asistencia <80 % → aviso»), columnas calculadas. Editor guiado, no texto libre críptico.
- Nota trimestral: ítems→criterios→0–10 con desglose por criterio y competencia. Cierre/reapertura de trimestre.
- **Evaluación final:** motor configurable (aritmética / ponderada 30-30-40 editable / continua), conversión a IN·SU·BI·NT·SB con bandas editables, `notaDocente` como override marcado.
- Comentarios por alumno/trimestre y final, con **banco de comentarios** con placeholders `{nombre}` y categorías.

### M6 Evaluación INFANTIL
Solo escala cualitativa (Iniciado/En proceso/Conseguido) sobre criterios del Área I en 3 momentos. Regla dura: grupos `infantil` no admiten números ni acceden a M5. Informe trimestral cualitativo con banco propio + resumen automático de registros.

### M7 Informes y exportación
PDF (informe individual, acta de grupo, comentarios por grupo/trimestre con botón copiar para Raíces), XLSX y CSV (notas, asistencia). Plantillas de informe con logo/curso configurables. Todo local; `apoyos` jamás se exporta.

### M8 Horario, calendario y herramientas de aula
- Horario semanal por grupo; festivos y vacaciones del curso; eventos/reuniones/recordatorios con **notificación local** (PWA, sin servidores).
- Herramientas EF: **generador de equipos equilibrados** (aleatorio o con separaciones «no juntar»), selector aleatorio de alumno, cronómetro con intervalos (trabajo/descanso) y marcador de tanteo a pantalla completa. Equipos guardables por sesión.

### M9 Backup y seguridad
Backup cifrado export/import (también sirve para pasar datos móvil↔PC, a mano o por WebDAV §10). Recordatorio semanal si no hay backup reciente. PIN; log del agente con deshacer.

## 6. M8-bis — AGENTE DE VOZ

Entrada por dictado del teclado nativo (FAB → hoja con campo enfocado). **No** Web Speech API. Pipeline: (1) fuzzy local de nombres → tokens `[A17]`; resolución local de grupos y fechas relativas; (2) `fetch` a `https://api.anthropic.com/v1/messages` con headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`, `anthropic-dangerous-direct-browser-access: true`; tool use con catálogo cerrado; solo viaja texto pseudonimizado + fecha + tokens de grupos; (3) modelo por defecto `claude-haiku-4-5-20251001`, alternativo `claude-sonnet-4-6`, campo editable; (4) tarjeta de confirmación con nombres reales resueltos en local → Confirmar/Editar/Cancelar; (5) escritura + log con deshacer.

Acciones v1: `registrar_observacion`, `marcar_asistencia`, `marcar_chandal`, `calificar`, `anadir_comentario_eval`, `crear_nota_sesion`, `consultar` (el modelo solo clasifica; la app ejecuta la consulta en local), `deshacer_ultima`. Fallback offline: parser local (acciones 1–3 y 8). Desambiguación con chips si el matching es dudoso.

## 7. UX TRANSVERSAL

Mobile-first a una mano; escritura optimista sin spinners; Deshacer en toda escritura; máx. 3 taps para acciones frecuentes; modo pista; app usable vacía con CTAs claros; español en toda la UI.

## 8. FASES (cada una compila, se ve con el diseño de §3 y es usable)

0. **Auditoría del código existente** contra esta spec → plan conservar/refactorizar/rehacer → esperar aprobación.
1. Tokens + sistema de diseño + shell de navegación + modelo Dexie + Ajustes + M1.
2. M2 pase de lista + Hoy + M8 horario básico.
3. M4 observaciones + M3 planificador + Banco de Juegos + plantillas.
4. M5 Cuaderno completo (rejilla, fórmulas, trimestre, final, comentarios).
5. M6 Infantil.
6. M7 informes PDF/XLSX/CSV.
7. Agente de voz completo + fallback offline.
8. M8 calendario/avisos + herramientas de aula + M9 backup cifrado + PIN + pulido PWA.

## 9. QUÉ NO HACER

Sin familias/alumnado, sin quizzes, sin integraciones externas (Classroom/Moodle/Drive), sin fotos/audio, sin inventar textos legales, sin colores fuera de tokens, sin enviar a ninguna API nombres ni contenido legible de la base de datos. La app debe funcionar entera sin red: las dos únicas conexiones (§1.2) son opcionales y su ausencia nunca bloquea nada.

## 10. WEBDAV — TRANSPORTE DE LA COPIA CIFRADA

Sirve para lo que §9 M9 ya pedía —pasar los datos del móvil al PC— sin cable ni fichero a mano. **No es sincronización**: no hay mezcla de registros, ni resolución de conflictos, ni servidor de la app. Es el mismo `.enc` de M9 subido y bajado entero.

**Invariantes (no negociables):**
1. Al servidor solo sube el fichero **ya cifrado** por M9. La passphrase de la copia no viaja, no se deriva de las credenciales del servidor y no se guarda en ningún sitio.
2. Un fichero bajado del servidor entra por el **mismo camino** que uno elegido a mano: `inspeccionarBackup` → cotejo de registros → confirmación explícita → `restaurarBackup`. El servidor no tiene vía rápida, y un fichero manipulado falla en la verificación AES-GCM.
3. Solo `https` (salvo `localhost`): Basic auth manda las credenciales en cada petición.
4. Las credenciales del servidor se guardan solo en local, igual que la API key (§1.3).

Verbos usados: `PROPFIND` (listar), `PUT` (subir), `GET` (bajar). Sin biblioteca: `fetch` y poco más (`lib/webdav.ts` es puro y testeable; `db/webdav.ts` lo une con M9).

**Aviso conocido:** un WebDAV que no mande cabeceras CORS rechazará las peticiones del navegador. No es un fallo de la app; hay que habilitarlo en el servidor. El error de red lo dice explícitamente en vez de un «Failed to fetch» opaco.

---

## 11. FIRESTORE — TRANSPORTE AUTOMÁTICO DE LA COPIA CIFRADA

Lo mismo que §10, pero solo: el `.enc` de M9 sube unos segundos después de cada cambio local y baja e importa solo al abrir la app si el otro dispositivo va por delante. **Sigue sin ser sincronización de registros:** no hay mezcla, no hay resolución automática de conflictos, no hay servidor de la app. Es el mismo fichero entero, subido y bajado entero.

**Invariantes (los de §10, más los propios):**
1. Al servidor solo sube el fichero **ya cifrado** por M9, con el mismo `empaquetar()` y el mismo formato. El cifrado no cambia por sincronizar.
2. Lo que baja entra por el **mismo camino** que un fichero elegido a mano: `inspeccionarBackup` → `restaurarBackup`. Un blob manipulado falla en la verificación AES-GCM.
3. **Nunca se fusiona.** Si el local y el remoto cambiaron desde la última sincronización aplicada, la app se detiene, enseña las dos fechas y deja elegir. Ni un `merge` ni un «gana el más nuevo» silencioso.
4. Solo `initializeApp` y `getFirestore`. **Nada de Analytics**: sería telemetría (§1.1). El SDK se importa de forma dinámica, así que un dispositivo sin sincronización configurada no lo descarga.
5. La app funciona entera sin red. Sin conexión se sigue escribiendo en local y el cambio queda en cola; nada se bloquea.

**Excepción a §1.3, consciente:** la passphrase de la copia **sí** se guarda en local (`Config.sincro.passphrase`), porque es la única forma de cifrar y descifrar sin preguntar, que es lo que hace automática la sincronización. Mismo trato que `apiKey`: local, nunca en el repo, nunca en la red. Se avisa en Ajustes de que el PIN no cifra el disco.

**Esquema remoto:**

```
sync/{idSincro}                 → meta { version, actualizado, dispositivo, partes, bytes, esquema, creado }
sync/{idSincro}/partes/{0..n-1} → { datos: Bytes }
```

`version` es un entero monótono: se compara sin depender de que los relojes coincidan. Las partes se escriben antes que la meta, así que un lector nunca ve una copia a medio subir. El troceado a ~700 kB existe por el límite de 1 MiB por documento de Firestore.

**Modelo de acceso:** no hay cuentas. El `idSincro` **es** la credencial: ≥24 caracteres del alfabeto base64url, generados al azar por la app. Las reglas (`firestore.rules`, en la raíz del repo, se pegan a mano en la consola) conceden `get`/`create`/`update` a quien conozca un ID con esa forma, y niegan `list` para que la colección no se pueda recorrer. Quien no conoce el ID no lee, no escribe y no enumera; quien lo conoce obtiene bytes que no puede abrir.

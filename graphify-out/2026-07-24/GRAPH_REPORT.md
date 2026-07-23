# Graph Report - C:\Users\orteg\Documents\cuaderno-ef  (2026-07-24)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 537 nodes · 1472 edges · 21 communities (20 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ad977aad`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- planificador.ts
- App.tsx
- useUI
- EquiposGenerador.tsx
- cuaderno.ts
- types.ts
- db
- devDependencies
- informes.ts
- Infantil.tsx
- compilerOptions
- compilerOptions
- nuevoId
- Ajustes.tsx
- Juegos.tsx
- generar-iconos.mjs
- tsconfig.json

## God Nodes (most connected - your core abstractions)
1. `useUI` - 54 edges
2. `navegar()` - 38 edges
3. `nuevoId()` - 35 edges
4. `db` - 34 edges
5. `CuadernoDB` - 26 edges
6. `aISO()` - 24 edges
7. `Cabecera()` - 20 edges
8. `Alumno` - 19 edges
9. `compilerOptions` - 18 edges
10. `Hoja()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `generarActaGrupo()` --references--> `jspdf`  [EXTRACTED]
  src/lib/informes.ts → package.json
- `generarInformeIndividual()` --references--> `jspdf`  [EXTRACTED]
  src/lib/informes.ts → package.json
- `exportarNotasXLSX()` --references--> `xlsx`  [EXTRACTED]
  src/lib/informes.ts → package.json
- `Hoy()` --indirect_call--> `leerCursoActivo()`  [INFERRED]
  src/pages/Hoy.tsx → src/db/curso.ts
- `grupoQueTocaEn()` --calls--> `diaLectivo()`  [EXTRACTED]
  src/lib/pseudonimizacion.ts → src/lib/fechas.ts

## Import Cycles
- None detected.

## Communities (21 total, 1 thin omitted)

### Community 0 - "planificador.ts"
Cohesion: 0.08
Nodes (54): aplicarPlantillaSesion(), copiarPlanificacion(), crearSesion(), crearUnidad(), duplicarSesion(), duplicarUnidad(), editarSesion(), eliminarSesion() (+46 more)

### Community 1 - "App.tsx"
Cohesion: 0.07
Nodes (39): Contenido(), AgenteVoz(), BadgeEtapa(), BottomNav(), PESTANAS, AccionCabecera(), Cabecera(), Estado (+31 more)

### Community 2 - "useUI"
Cohesion: 0.07
Nodes (40): CursoEscolarAjustes(), HojaPegarCalendario(), Hoja(), HojaObservacion(), SIGNOS, TIPOS, Snackbar(), duplicarRubrica() (+32 more)

### Community 3 - "EquiposGenerador.tsx"
Cohesion: 0.09
Nodes (30): EquipoPizarra, Pizarra(), leerAsistenciaGrupo(), alumnosGenerables(), equiposGuardados(), guardarEquipo(), historialEquipos(), vinculosDelGrupo() (+22 more)

### Community 4 - "cuaderno.ts"
Cohesion: 0.11
Nodes (29): Cambios, CARITAS, CARITAS_5, Celda(), EditorColumna(), escalaCaritas(), TablaRubrica(), HojaColumna() (+21 more)

### Community 5 - "types.ts"
Cohesion: 0.12
Nodes (33): CuadernoDB, AccionAgente, Asistencia, Calificacion, CalificacionOficial, ComentarioBanco, Config, Criterio (+25 more)

### Community 6 - "db"
Cohesion: 0.11
Nodes (31): Fase, AccionId, AccionResuelta, apilarDeshacer(), deshacerUltimaDelAgente(), ejecutarAccion(), estadoAsistenciaDeTexto(), interpretarLocal() (+23 more)

### Community 7 - "devDependencies"
Cohesion: 0.06
Nodes (32): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+24 more)

### Community 8 - "informes.ts"
Cohesion: 0.10
Nodes (31): dexie, dexie-react-hooks, fuse.js, jspdf, jspdf-autotable, lucide-react, dependencies, dexie (+23 more)

### Community 9 - "Infantil.tsx"
Cohesion: 0.10
Nodes (23): App(), AreaInfantilJson, cicloDeCurso(), CicloPrimariaJson, CompetenciaInfantilJson, CriterioInfantilJson, CriterioPrimariaJson, criteriosDeGrupo() (+15 more)

### Community 10 - "compilerOptions"
Cohesion: 0.08
Nodes (23): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+15 more)

### Community 11 - "compilerOptions"
Cohesion: 0.10
Nodes (19): ES2023, node, vite.config.ts, compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module (+11 more)

### Community 12 - "nuevoId"
Cohesion: 0.17
Nodes (14): alternarChandal(), ciclarEstado(), CICLO, marcarTodosPresentes(), ResumenAsistencia, siguienteEstado(), nuevoId(), crearVinculo() (+6 more)

### Community 13 - "Ajustes.tsx"
Cohesion: 0.18
Nodes (10): HojaAgente(), CONFIG_POR_DEFECTO, guardarConfig(), leerConfig(), useConfig(), BandasOficiales, ModoMedia, Ajustes() (+2 more)

### Community 14 - "Juegos.tsx"
Cohesion: 0.21
Nodes (15): ALIAS, aLista(), anadirAlBanco(), analizarJuegos(), aTexto(), buscarJuegos(), CAMPOS, facetas() (+7 more)

### Community 15 - "generar-iconos.mjs"
Cohesion: 0.31
Nodes (8): BLANCO, crc32(), dibujar(), png(), PRIMARIO, PUBLIC, RAIZ, trozo()

## Knowledge Gaps
- **134 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+129 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `informes.ts` to `devDependencies`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _134 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `planificador.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07932692307692307 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07005649717514124 - nodes in this community are weakly interconnected._
- **Should `useUI` be split into smaller, more focused modules?**
  _Cohesion score 0.07039187227866474 - nodes in this community are weakly interconnected._
- **Should `EquiposGenerador.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09407665505226481 - nodes in this community are weakly interconnected._
- **Should `cuaderno.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10810810810810811 - nodes in this community are weakly interconnected._
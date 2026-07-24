# Graph Report - cuaderno-ef  (2026-07-24)

## Corpus Check
- 76 files · ~52,946 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 560 nodes · 1494 edges · 20 communities (19 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f39acc02`
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

## Communities (20 total, 1 thin omitted)

### Community 0 - "planificador.ts"
Cohesion: 0.08
Nodes (59): BadgeEtapa(), aplicarPlantillaSesion(), copiarPlanificacion(), crearSesion(), crearUnidad(), duplicarSesion(), duplicarUnidad(), editarSesion() (+51 more)

### Community 1 - "App.tsx"
Cohesion: 0.06
Nodes (35): App(), Contenido(), HojaAgente(), BottomNav(), PESTANAS, AccionCabecera(), Cabecera(), Estado (+27 more)

### Community 2 - "useUI"
Cohesion: 0.06
Nodes (46): AgenteVoz(), CursoEscolarAjustes(), HojaPegarCalendario(), Hoja(), HojaObservacion(), SIGNOS, TIPOS, Snackbar() (+38 more)

### Community 3 - "EquiposGenerador.tsx"
Cohesion: 0.09
Nodes (30): EquipoPizarra, Pizarra(), alumnosGenerables(), equiposGuardados(), guardarEquipo(), historialEquipos(), vinculosDelGrupo(), ConfigGeneracionEquipos (+22 more)

### Community 4 - "cuaderno.ts"
Cohesion: 0.06
Nodes (63): Cambios, CARITAS, CARITAS_5, Celda(), EditorColumna(), escalaCaritas(), TablaRubrica(), HojaColumna() (+55 more)

### Community 5 - "types.ts"
Cohesion: 0.09
Nodes (21): 1. RESTRICCIONES NO NEGOCIABLES (privacidad), 2. STACK, 3.1 Tokens de color (únicos permitidos; definir en `src/styles/tokens.css` y consumir SIEMPRE vía tokens, jamás hex sueltos en componentes), 3.2 Tipografía y componentes, 3. DISEÑO — SISTEMA OBLIGATORIO, 4. MODELO DE DATOS (Dexie), 5. MÓDULOS — PARIDAD ADDITIO MEJORADA, 6. M8-bis — AGENTE DE VOZ (+13 more)

### Community 6 - "db"
Cohesion: 0.11
Nodes (32): Fase, AccionId, AccionResuelta, apilarDeshacer(), deshacerUltimaDelAgente(), ejecutarAccion(), estadoAsistenciaDeTexto(), interpretarLocal() (+24 more)

### Community 7 - "devDependencies"
Cohesion: 0.06
Nodes (32): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+24 more)

### Community 8 - "informes.ts"
Cohesion: 0.10
Nodes (31): dexie, dexie-react-hooks, fuse.js, jspdf, jspdf-autotable, lucide-react, dependencies, dexie (+23 more)

### Community 9 - "Infantil.tsx"
Cohesion: 0.11
Nodes (22): AreaInfantilJson, cicloDeCurso(), CicloPrimariaJson, CompetenciaInfantilJson, CriterioInfantilJson, CriterioPrimariaJson, criteriosDeGrupo(), criteriosInfantil() (+14 more)

### Community 10 - "compilerOptions"
Cohesion: 0.08
Nodes (23): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+15 more)

### Community 11 - "compilerOptions"
Cohesion: 0.10
Nodes (19): ES2023, node, vite.config.ts, compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module (+11 more)

### Community 12 - "nuevoId"
Cohesion: 0.16
Nodes (16): alternarChandal(), ciclarEstado(), CICLO, leerAsistenciaGrupo(), marcarTodosPresentes(), ResumenAsistencia, siguienteEstado(), columnasDe() (+8 more)

### Community 14 - "Juegos.tsx"
Cohesion: 0.23
Nodes (15): db, ALIAS, aLista(), anadirAlBanco(), analizarJuegos(), aTexto(), buscarJuegos(), CAMPOS (+7 more)

### Community 15 - "generar-iconos.mjs"
Cohesion: 0.31
Nodes (8): BLANCO, crc32(), dibujar(), png(), PRIMARIO, PUBLIC, RAIZ, trozo()

## Knowledge Gaps
- **152 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+147 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `informes.ts` to `devDependencies`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _152 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `planificador.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07806841046277666 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.061016949152542375 - nodes in this community are weakly interconnected._
- **Should `useUI` be split into smaller, more focused modules?**
  _Cohesion score 0.06384180790960452 - nodes in this community are weakly interconnected._
- **Should `EquiposGenerador.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09059233449477352 - nodes in this community are weakly interconnected._
- **Should `cuaderno.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
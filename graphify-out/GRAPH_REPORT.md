# Graph Report - cuaderno-ef  (2026-07-24)

## Corpus Check
- 77 files · ~55,402 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 570 nodes · 1519 edges · 25 communities (20 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ff6509c3`
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
- package.json
- Juegos.tsx
- generar-iconos.mjs
- tsconfig.json
- jspdf-autotable
- postcss
- @vitejs/plugin-react
- vitest

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
- `exportarNotasXLSX()` --references--> `xlsx`  [EXTRACTED]
  src/lib/informes.ts → package.json
- `generarActaGrupo()` --references--> `jspdf`  [EXTRACTED]
  src/lib/informes.ts → package.json
- `generarInformeIndividual()` --references--> `jspdf`  [EXTRACTED]
  src/lib/informes.ts → package.json
- `HojaPegarCalendario()` --calls--> `useUI`  [EXTRACTED]
  src/components/CursoEscolarAjustes.tsx → src/store/ui.ts
- `crearVinculo()` --calls--> `nuevoId()`  [EXTRACTED]
  src/db/equipos.ts → src/db/db.ts

## Import Cycles
- None detected.

## Communities (25 total, 5 thin omitted)

### Community 0 - "planificador.ts"
Cohesion: 0.09
Nodes (43): BadgeEtapa(), Hoja(), nuevoId(), aplicarPlantillaSesion(), copiarPlanificacion(), crearSesion(), crearUnidad(), duplicarSesion() (+35 more)

### Community 1 - "App.tsx"
Cohesion: 0.29
Nodes (3): Estado, LimiteError, Props

### Community 2 - "useUI"
Cohesion: 0.05
Nodes (61): jspdf, jspdf, Contenido(), AgenteVoz(), responderConsulta(), BottomNav(), PESTANAS, Cabecera() (+53 more)

### Community 3 - "EquiposGenerador.tsx"
Cohesion: 0.06
Nodes (48): AccionCabecera(), EquipoPizarra, Pizarra(), alternarChandal(), ciclarEstado(), CICLO, leerAsistenciaGrupo(), marcarTodosPresentes() (+40 more)

### Community 4 - "cuaderno.ts"
Cohesion: 0.05
Nodes (77): Cambios, CARITAS, CARITAS_5, Celda(), EditorColumna(), escalaCaritas(), TablaRubrica(), HojaColumna() (+69 more)

### Community 5 - "types.ts"
Cohesion: 0.09
Nodes (21): 1. RESTRICCIONES NO NEGOCIABLES (privacidad), 2. STACK, 3.1 Tokens de color (únicos permitidos; definir en `src/styles/tokens.css` y consumir SIEMPRE vía tokens, jamás hex sueltos en componentes), 3.2 Tipografía y componentes, 3. DISEÑO — SISTEMA OBLIGATORIO, 4. MODELO DE DATOS (Dexie), 5. MÓDULOS — PARIDAD ADDITIO MEJORADA, 6. M8-bis — AGENTE DE VOZ (+13 more)

### Community 6 - "db"
Cohesion: 0.06
Nodes (46): Fase, HojaAgente(), HojaObservacion(), SIGNOS, TIPOS, AccionId, AccionResuelta, apilarDeshacer() (+38 more)

### Community 7 - "devDependencies"
Cohesion: 0.12
Nodes (17): autoprefixer, devDependencies, autoprefixer, tailwindcss, @types/node, @types/react, @types/react-dom, typescript (+9 more)

### Community 8 - "informes.ts"
Cohesion: 0.12
Nodes (17): dexie, dexie-react-hooks, fuse.js, lucide-react, dependencies, dexie, dexie-react-hooks, fuse.js (+9 more)

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
Cohesion: 0.15
Nodes (20): CursoEscolarAjustes(), HojaPegarCalendario(), leerCursoActivo(), limitesPorDefecto(), nombreCursoActual(), obtenerCursoActivo(), construir(), esFinDeSemana() (+12 more)

### Community 13 - "package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, preview, test, type (+1 more)

### Community 14 - "Juegos.tsx"
Cohesion: 0.20
Nodes (16): ALIAS, aLista(), anadirAlBanco(), analizarJuegos(), aTexto(), buscarJuegos(), CAMPOS, facetas() (+8 more)

### Community 15 - "generar-iconos.mjs"
Cohesion: 0.31
Nodes (8): BLANCO, crc32(), dibujar(), png(), PRIMARIO, PUBLIC, RAIZ, trozo()

## Knowledge Gaps
- **153 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+148 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `informes.ts` to `useUI`, `jspdf-autotable`, `package.json`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Why does `jspdf` connect `useUI` to `informes.ts`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `vitest`, `package.json`, `postcss`, `@vitejs/plugin-react`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _153 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `planificador.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09433962264150944 - nodes in this community are weakly interconnected._
- **Should `useUI` be split into smaller, more focused modules?**
  _Cohesion score 0.05421686746987952 - nodes in this community are weakly interconnected._
- **Should `EquiposGenerador.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06153846153846154 - nodes in this community are weakly interconnected._
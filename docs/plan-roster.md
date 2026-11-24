# Plan Vivo · Mejora de «Crear roster» (`hrm-roster-manager`)

> **Estado general:** **ROSTER-07 · Activación y recuperación** en revisión (entorno aislado verificado; `v1` sigue como predeterminado y se requiere aprobación expresa para habilitar `v2` en operación)  
> **Última actualización:** 2026-11-20  
> **Estrategia de despliegue:** Motor paralelo en vista previa. El motor actual sigue disponible y será la opción predeterminada durante las pruebas hasta la aprobación explícita en **ROSTER-07**.

---

## 1. Reglas de seguimiento

- **Estados válidos:** `Pendiente` · `En curso` · `En revisión` · `Cerrado` · `Bloqueado`
- **Actualización:** Actualizar este documento al iniciar y al cerrar cada ticket.
- **Registro de cierre:** Para cada ticket cerrado, documentar:
  1. Fecha de cierre
  2. Lo entregado
  3. Prueba realizada
  4. Resultado obtenido
  5. Siguiente ticket
- **Criterio de cierre:** Solo marcar `Cerrado` cuando el ticket cumpla íntegramente su criterio de aceptación.

---

## 2. Tablero de tickets

| Ticket | Título | Estado | Depende de |
|---|---|---|---|
| **ROSTER-01** | Plan vivo | **Cerrado** | — |
| **ROSTER-02** | Dotación y cobertura | **Cerrado** | ROSTER-01 |
| **ROSTER-03** | Jornada y permisos | **Cerrado** | ROSTER-02 |
| **ROSTER-04** | Aeropuerto NS22 | **Cerrado** | ROSTER-03 |
| **ROSTER-05** | Cobertura entre áreas | **Cerrado** | ROSTER-03, ROSTER-04 |
| **ROSTER-02A** | Feriados nacionales | **Cerrado** | ROSTER-02, ROSTER-05 |
| **ROSTER-08** | Vacantes en Planificación Diaria | **Cerrado** | ROSTER-02A, ROSTER-05 |
| **ROSTER-06** | Comparación en vista previa | **Cerrado** | ROSTER-02, ROSTER-03, ROSTER-04, ROSTER-05, ROSTER-08 |
| **ROSTER-07** | Activación y recuperación | **En revisión** | ROSTER-06 |
| **ROSTER-09** | Cálculo de dotación nocturna de Blue Express | **En revisión** | ROSTER-02, ROSTER-08 |

---

## 3. Comportamiento actual observado (solo lectura)

Revisión realizada sobre el motor actual sin modificar código ni ejecutar escrituras en base de datos:

1. **Punto de entrada y guardado directo (`src/app/(dashboard)/shifts/actions.ts`, `src/app/(dashboard)/shifts/roster/roster-grid-client.tsx`, `src/lib/scheduler/index.ts`)**
   - `roster-grid-client.tsx` invoca `runScheduler(...)` (línea 605), que llama a `generateSchedule(...)` en `src/lib/scheduler/index.ts`.
   - `generateSchedule` borra asignaciones no validadas/no publicadas del rango (`shift_assignments`) e inserta/actualiza directamente las nuevas asignaciones mediante `upsert`. No existe un modo de vista previa comparativa sin guardado para el motor nuevo.
   - `runScheduler` extiende `endDate` hasta el domingo de esa semana (`endOfWeek(..., { weekStartsOn: 1 })`).

2. **Dotación, prioridades y conteo de cobertura (`src/lib/scheduler/index.ts`, `src/lib/scheduler/priorities.ts`, `src/app/(dashboard)/shifts/dotacion/materialize-utils.ts`)**
   - `materialize-utils.ts` materializa `shift_requirements` por fecha con `required_count`, `priority` (resuelta por día desde `priority` + `priority_overrides`) e `is_extra: false`.
   - Sin embargo, aunque la consulta actual de `generateSchedule` sobre `shift_requirements` (`select('*, ...')`) sí trae la columna `priority`, el generador no usa ese valor al preparar ni ordenar los cupos (`ShiftSlot` no incluye `priority`). En su lugar, `getSlotPriority` (`priorities.ts`) asigna puntajes fijos por nombre de cargo/área/turno, y la consulta tampoco filtra por `is_extra`.
   - Al calcular la cobertura final (`index.ts` líneas 456–466), `generateSchedule` cuenta asignaciones por `date` y `position_id` sin cruzar `area_id`, `shift_id` ni distinguir `is_extra`.
   - Al armar `slots` (`index.ts` líneas 262–289), descuenta `protectedAssignments` por `(date, shift_id, area_id, position_id)`, pero no excluye explícitamente requerimientos extra ni reporta vacantes detalladas por fecha/área/cargo/turno.

3. **Filtros de personal y cargos secundarios (`src/lib/scheduler/index.ts`, `src/lib/scheduler/greedy-assign.ts`)**
   - Cuando se pasa `positionFilter`, `generateSchedule` (`index.ts` líneas 90–98) filtra `activeShiftPersonnel` evaluando **solo `main_position`** (y nombre del cargo principal), excluyendo de raíz a candidatos habilitados por `secondary_positions`.
   - Además, en `greedy-assign.ts`, `runTiers` ejecuta primero `Critical` y `Standard` solo con `passes: [0, 1]` (únicamente `main_position`), luego corre el bloque de refuerzos semanales (`WEEKLY REINFORCEMENT`), y recién después corre `Support` (`passes: [2, 3]`) que habilita `secondary_positions`. Esto provoca que los refuerzos consuman días disponibles antes de cubrir vacantes por polivalencia y que un cupo crítico secundario no pueda desplazar un cupo normal principal.

4. **Reglas de jornada, descansos y permisos (`src/lib/scheduler/constraints.ts`, `src/lib/scheduler/greedy-assign.ts`)**
   - `checkMaxHoursPerWeek`: usa `MAX_HOURS_PER_WEEK = 40` para refuerzos, pero permite hasta `45` horas para requerimientos reales; exime contratos especiales, `7X7`, `4X4`, `BLUE_`, `CANES` y `isAeroNight`. No aplica aún el límite vigente de **42 horas** semanales ni verifica un tope contractual menor.
   - `checkMinRestBetweenShifts`: exige `630` minutos (`10.5` horas) hacia atrás y `MIN_REST_HOURS = 10` hacia adelante, por debajo del mínimo de **12 horas** acordado. Además, `checkPreferences` penaliza turnos día/noche como `warning`, lo que en `pass < 3` bloquea asignaciones (`greedy-assign.ts` línea 659).
   - `checkMinDaysOff`: exige 2 días libres de lunes a domingo (eximiendo patrones especiales y `isAeroNight`), pero `FINAL REVISION` (`greedy-assign.ts` líneas 934+) fuerza rellenar hasta 5 días por semana.
   - `checkMaxConsecutiveDays`: límite de 7 días consecutivos como `warning` (soft), y `greedy-assign.ts` en `pass >= 3` ignora `warning`.
   - `checkSundaysOff`: exige al menos 2 domingos libres por mes calendario, eximiendo `has_special_contract`, `7X7`, `4X4`, `BLUE_`, `isAeroNight` y `CANES`.
   - `leaves`: `generateSchedule` carga `leaves` con `status = 'approved'` y los mete todos en un único `Set<string>` (`leave_dates`), sin distinguir permisos de libre elección (que deben mover descansos habituales cuando sea posible) de licencias médicas y vacaciones.

5. **Reglas específicas y lógica hardcodeada (`src/lib/scheduler/greedy-assign.ts`, `src/lib/scheduler/optimizer.ts`)**
   - `greedy-assign.ts` contiene múltiples pases previos con nombres propios y turnos fijos hardcodeados (`PASS -1.0` a `PASS -0.2`, p. ej. `ITALO`, `DEIMAR`, `ALVARO`, `MARCO`, `ALEX`, `dStr.endsWith('-23')`).
   - El bloque `4x4` (`FINAL PASS: DETERMINISTIC AIRPORT 4x4 OVERRIDE`, líneas 859–931) borra las asignaciones previas de la persona `4x4`, usa un espejo de `-4` días respecto a `state.assignments` previos y crea asignaciones en `NS 22` con `shift_end` fallback `'08:00'` y `duration_hours` fallback `8`. No contempla cobertura de ausencias de titulares NS22 por otros operadores de Aeropuerto habilitados.
   - `optimizer.ts`: realiza intercambios en la misma fecha entre dos personas para reducir errores de `validateAllConstraints`, sin validar explícitamente compatibilidad de cargo al intercambiar cuando no está cubierta por la función de costo, ni considerar jerarquía de prioridades entre cupos.

6. **Planificación Diaria y Dotación Extra (`src/lib/shifts/daily-operational-data.ts`, `src/app/(dashboard)/shifts/daily/actions.ts`)**
   - `fetchDailyOperationalData` carga `shift_assignments` y `shift_requirements` (regulares e `is_extra = true`) para una fecha, contando asignaciones extra activas por `shift_id|area_id|position_id`.
   - Los cupos ordinarios sin cobertura no generan automáticamente un cupo asociado en el flujo de Dotación Extra al guardar un roster nuevo, ni existe vinculación bidireccional que cierre la falta y el cupo extra de manera unificada sin duplicados al regenerar.

---

## 4. Detalle de tickets, reglas acordadas y verificaciones pendientes

### ROSTER-01 · Plan vivo
- **Estado:** `Cerrado`
- **Entrega:** Crear `docs/plan-roster.md` con estos tickets, sus estados, las reglas acordadas y las verificaciones pendientes.
- **Criterio de cierre:** Documento creado, revisado contra el código en solo lectura y aprobado por el usuario antes de editar código o escribir en DB.

---

### ROSTER-02 · Dotación y cobertura
- **Estado:** `Cerrado`
- **Entregado en motor paralelo (`src/lib/scheduler/v2/`):**
  - `src/lib/scheduler/v2/types.ts`: tipos de requerimientos fechados, asignaciones existentes, cupos consolidados (`DotacionSlot`) y detalle/resumen de cobertura (`SlotCoverageDetail`, `DotacionCoverageSummary`).
  - `src/lib/scheduler/v2/dotacion.ts`: `prepareDotacionSlots` y `measureDotacionCoverage` para consolidar requerimientos por `(date, area_id, position_id, shift_id)`, preservar `priority` por fecha usando `normalizePriority` y `PRIORITY_RANK` (`matrix-utils.ts`), separar dotación ordinaria (`is_extra = false`) de dotación extra (`is_extra = true`), y contar asignaciones protegidas exclusivamente en el cupo exacto que les corresponde.
  - `src/lib/scheduler/v2/index.ts`: punto de entrada del motor paralelo v2 (sin modificar el motor actual ni escribir en base de datos).
  - `src/lib/scheduler/v2/dotacion.test.ts`: suite unitaria con datos sintéticos (4 pruebas aprobadas).
- **Reglas acordadas:**
  - Leer los requerimientos fechados de `shift_requirements` y sus prioridades reales (`priority`), incluidas las diferencias por día.
  - Distinguir dotación ordinaria (`is_extra = false`) y dotación extra (`is_extra = true`).
  - Medir cobertura y vacantes por **fecha, área, cargo y turno**.
  - Contar correctamente los turnos protegidos (manuales, bloqueados, validados/publicados, congelados) y los cupos que quedan cubiertos sin doble conteo ni descalce entre áreas/turnos.
- **Verificaciones pendientes:**
  - Confirmar en DB los valores reales de `priority` presentes en `shift_requirements` y `requirement_templates` (p. ej. `Crítica` / `Alta` / `Normal` u otros).
  - Verificar cómo se contabilizan los turnos protegidos cuando una persona protegida tiene un cargo/turno distinto al del requerimiento.
- **Ajuste pendiente (regla operativa de feriados — en cola):**
  - **Calendario nacional verificado por año:** usar exclusivamente el calendario verificado de **feriados legales nacionales de Chile** para el mes seleccionado (con **fuente y fecha de revisión registradas**, partiendo de Gob.cl y verificando cambios/especiales en LeyChile). **Se excluyen los feriados regionales y comunales.** Si falta el calendario verificado del año seleccionado, mostrar un **aviso explícito**.
  - **Aplicación en «Generar Mes», motor nuevo y Planificación Diaria:**
    - En cada **feriado nacional** del mes elegido, dejar en **cero** la dotación ordinaria requerida para todos los turnos de:
      - `Atrex` — `Operador de grúa`
      - `Base` — `Operador de grúa`
      - `Base` — `Supervisor`
    - Aplicar la misma regla al leer cupos de meses ya generados en `shift_requirements`, tanto en el cálculo de demanda del motor nuevo como cuando Planificación Diaria muestre faltas y pendientes de Dotación Extra.
    - **Conservar** las asignaciones protegidas y los extras manuales existentes, y mantener intacta la dotación configurada de los demás cargos.
  - **Pruebas requeridas antes de cerrar el ajuste:** comprobar que un feriado nacional aplique la regla (incluyendo mes con cupos ya generados), que un feriado exclusivamente regional o comunal deje la dotación normal y que los demás cargos conserven sus cupos.
  - **Prerrequisito previo a implementar:** verificar qué calendario/tabla de feriados usa hoy la aplicación.

---

### ROSTER-03 · Jornada y permisos
- **Estado:** `Cerrado`
- **Hallazgos del esquema actual (`src/types/database.ts`, `leaves/`, `worker/actions.ts`):**
  - `leaves.type` distingue `vacation`, `sick`, `maternity`, `personal` y `other` (con `reason = 'Solicitud mensual de días libres'` o `free_request` en vistas). Así, los permisos de libre elección corresponden a `personal` / `free_request` / `other` con esa razón, separados de `sick`, `vacation` y `maternity`.
  - `personnel` posee `rotation_pattern` y `has_special_contract`, pero **no existe una columna numérica de horas semanales contractuales** (`contractual_weekly_hours` o similar). El motor `v2` admite ese campo opcional y usa `42h` cuando no viene definido.
- **Entregado en motor paralelo (`src/lib/scheduler/v2/`):**
  - `src/lib/scheduler/v2/types.ts`: tipos de perfil de jornada (`PersonnelScheduleProfile`, `ConfirmedRegimeConfig`), intervalo de turno (`ScheduledShiftInterval`), violaciones (`JornadaViolation`), categorías de permiso (`LeaveCategory`: `monthly_free_choice`, `generic_personal`, `medical_or_vacation`, `other_absence`) y casos de reubicación (`PermissionRelocationCase`).
  - `src/lib/scheduler/v2/jornada.ts`:
    - Intervalo real `[start, end)` (`getShiftOccupiedDates`) para detectar todos los días, semanas y meses con trabajo efectivo e invasión de ausencias aprobadas (incluyendo turnos nocturnos como NS22 sábado → domingo o domingo → lunes).
    - Criterio de imputación semanal de horas (`splitShiftHoursByWeek`): las `duration_hours` de un turno que cruza de semana (p. ej. domingo 22:00 → lunes 07:00) se prorratean por los minutos reales de `[start, end)` que caen en cada semana lunes–domingo, verificando el tope de 42h (o contractual menor) en todas las semanas afectadas.
    - Excepciones solo por régimen confirmado (`confirmed_regime`), eliminando exenciones automáticas por cargo, patrón o `has_special_contract`, e incorporando `identifyUnconfirmedRegimeCases` para listar casos pendientes de confirmación. (La regla de domingos para los dos titulares NS22 se incorporará en **ROSTER-04**).
    - Descanso mínimo de 12h reales (`checkMinRestBetweenShifts`), 2 días libres lun–dom (`checkWeeklyDaysOff`), 2 domingos libres por mes calendario (`checkMonthlySundaysOff`), rachas >7 días cruzando semanas/meses y descansos consecutivos como preferencia (`warning`).
    - Evaluación de permisos (`evaluatePermissionsForWeek`): distingue solicitud mensual de libre elección vs. permiso personal genérico (`personal`, sin reubicación); exige calendario base real (`baseCalendarDates`) y evalúa directamente los cupos reales compatibles (`compatibleSlots`, sin filtro sintético `08:00–16:00`). Si faltan cupos reales informa `pending_relocation`; si todos incumplen restricciones obligatorias informa `unrelocatable` con `blocking_reasons`; si solo propone un cupo informa `proposed_relocation`, reservando `relocated` para cuando el generador confirme la asignación en `confirmedRosterAssignments`.
  - `src/lib/scheduler/v2/jornada.test.ts`: 8 pruebas unitarias con datos sintéticos (sin DB).
- **Reglas acordadas:**
  - Aplicar el límite de horas ordinarias vigente (**42 horas semanales** para la jornada ordinaria general actual) y el límite contractual si es menor.
  - Exigir al menos **12 horas** entre la salida real de un turno y la siguiente entrada (o más si corresponde por normativa/contrato).
  - Para jornada de 5 días: respetar **2 días libres de lunes a domingo**.
  - Reservar **2 domingos libres por mes calendario** donde corresponda.
  - Preferir descansos consecutivos y evitar rachas de más de **7 días** continuos, incluso cruzando semanas o meses, respetando cualquier límite obligatorio más estricto.
  - **Permisos de libre elección:** mueven descansos habituales; si un turno no se puede reubicar, respetar el permiso e informar el caso explícitamente.
  - **Cumpleaños obligatorio:** el cumpleaños tomado de `birth_date` en la ficha es un día libre obligatorio (cargado para `v1` y `v2` en la comparación). Valida el día completo incluyendo turnos que cruzan medianoche (p. ej., si un titular NS22 cumple años el jueves, tampoco se le asigna el NS22 del miércoles que termina el jueves a las 07:00, buscando cobertura sin mover el ciclo 4x4). Aplica la misma lógica de reubicación que un día libre solicitado: si ya estaba libre, no hay turno que mover; si le tocaba trabajar, busca un cupo real compatible y, si no existe, respeta el cumpleaños e informa que quedó pendiente la reubicación. Si coincide con un turno ya protegido, conserva el turno y muestra el conflicto para revisión.
  - **Licencias médicas y vacaciones:** tratarlas por separado respecto a permisos de libre elección.
- **Verificaciones pendientes:**
  - Confirmar si se agregará una columna explícita de horas contractuales en `personnel` para trabajadores con jornada menor a 42h, o si todos los ordinarios usan 42h.
  - Confirmar el régimen aplicable y exenciones formales para los trabajadores con `has_special_contract = true` o patrones especiales (`4x4`, `7x7`, `BLUE_`, `CANES`) detectados por `identifyUnconfirmedRegimeCases` (los dos titulares NS22 se abordarán en **ROSTER-04**).
  - Verificar la fuente del calendario base real de cada operador al integrar con la planificación completa en **ROSTER-05** / **ROSTER-06**.

---

### ROSTER-04 · Aeropuerto NS22
- **Estado:** `Cerrado`
- **Entregado en motor paralelo (`src/lib/scheduler/v2/`):**
  - `src/lib/scheduler/v2/types.ts`: tipos `Ns22TitularConfig`, `Ns22ShiftDefinition`, `Ns22Assignment`, `Ns22PreservedProtected`, `Ns22TitularConflict`, `Ns22Vacancy`, `Ns22TitularCycleSummary`, `Ns22ScheduleResult`.
  - `src/lib/scheduler/v2/aeropuerto-ns22.ts`: `isNs22TitularWorkNight` y `scheduleAirportNs22` con ciclo 4x4 continuo e inmutable (`anchor_date` + `cycle_offset`) para los dos titulares exclusivamente en NS22 `22:00`–`07:00` del día siguiente; cruce previo contra cupos reales (`ns22Slots`) y turnos protegidos (`protectedAssignments`) por fecha, área, cargo y turno (conservando titulares/reemplazos protegidos, informando conflictos con turnos protegidos del titular sin mover el ancla 4x4 y evitando generar asignaciones o vacantes en noches sin requerimiento); domingos determinados por el ciclo sin cuota mensual ni saldo acumulado; cobertura de ausencias con otros operadores de Aeropuerto habilitados (prefiriendo bloques de 4 noches cuando hay 4 noches contiguas realmente por cubrir).
  - `src/lib/scheduler/v2/index.ts`: exporta las utilidades y tipos de `aeropuerto-ns22.ts`.
  - `src/lib/scheduler/v2/aeropuerto-ns22.test.ts`: 7 pruebas unitarias con datos sintéticos (sin DB).
- **Reglas acordadas:**
  - Mantener a los **dos titulares** exclusivamente en **NS22 de 22:00 a 07:00**, con ciclo **4x4 continuo** y el desfase actual entre ambos.
  - El día saliente tiene horas trabajadas (imputación real del turno nocturno).
  - Los domingos libres los determina el ciclo 4x4, sin cuota mensual ni saldo acumulado, **sujeto a verificar el régimen de jornada aplicable**.
  - Ante ausencias de titulares, cubrir las noches vacantes con otros operadores de Aeropuerto habilitados, prefiriendo bloques de 4 noches cuando sea viable y manteniendo intacto el ciclo/ancla del titular.
- **Verificaciones pendientes (antes de habilitar con datos reales):**
  - Confirmar en DB el horario exacto configurado para NS22 (`22:00` a `07:00` vs `08:00`) y su `duration_hours`.
  - Confirmar en DB quiénes son los dos titulares actuales y su ancla/desfase histórico (`anchor_date` y `cycle_offset`).
  - Confirmar formalmente el régimen de jornada aplicable al 4x4 en Aeropuerto para habilitar `confirmed_4x4_regime` (exención de cuota mensual de domingos).

---

### ROSTER-05 · Cobertura entre áreas
- **Estado:** `Cerrado`
- **Entregado en motor paralelo (`src/lib/scheduler/v2/`):**
  - `src/lib/scheduler/v2/types.ts`: tipos `CrossAreaAssignment`, `ReinforcementShiftConfig` (con `days_of_week` y `position_id`), `CrossAreaScheduleResult` (con `remaining_vacancies` y `audit_violations`) y banderas no excluyentes `prefers_night`/`avoids_night`.
  - `src/lib/scheduler/v2/cobertura.ts`: secuencia de 5 etapas Minerquim en `scheduleCrossArea`: (1) preparar calendario con ausencias aprobadas, protegidos, compromisos externos y rango/filtro inclusivo (`isSlotInScope`, `isPreservedCommitment`); (2) cubrir Aeropuerto NS22 primero manteniendo ciclo 4x4 de los dos titulares y protegidos, tratando cupos ordinarios pendientes de NS22 como críticos (`effectivePriorityRank = 4`) con preferencia sobre otros críticos si compiten por la misma persona y buscando alternativa para cubrir ambos cuando exista, conservando bloques de 4 cuando sea viable; (3) cubrir resto de la dotación por prioridad y cargo principal/secundario; (4) revisar y ajustar el roster completo (`audit_violations`, reasignaciones en 1 paso y `remaining_vacancies`); (5) asignar refuerzos al final separados de la cobertura ordinaria (Aeropuerto **AM07 L-V** y Bodegas **AM04** en cualquier bodega habilitada dentro del alcance/filtro).
  - `src/lib/scheduler/v2/index.ts`: exporta `scheduleCrossArea` y tipos asociados.
  - `src/lib/scheduler/v2/cobertura.test.ts`: 8 pruebas unitarias con datos sintéticos (sin DB).
- **Reglas acordadas:**
  - Optimizar en conjunto los cupos de cargos principales y secundarios.
  - Un cupo **Crítico en cargo secundario** puede desplazar un cupo **Normal en cargo principal**.
  - A igual prioridad, preferir el cargo principal.
  - Entre soluciones equivalentes, aprovechar la polivalencia para cubrir más vacantes.
  - Ejecutar los **refuerzos** para completar jornadas **después** de cubrir todas las vacantes posibles.
  - Considerar candidatos habilitados por cargo secundario y sus compromisos previos incluso fuera del filtro de cargo seleccionado.
  - Las etiquetas de día o noche (`prefers_night` / `avoids_night`) dejan de excluir operadores, salvo la exclusividad de los titulares NS22.
  - Revisar los demás «Turnos fijos» (`fixed_shift_id`) para identificar compromisos específicos.
- **Verificaciones pendientes:**
  - Auditar en DB todos los registros de `personnel` con `fixed_shift_id`, `secondary_positions` y `rotation_pattern` para documentar compromisos específicos reales y reemplazar reglas hardcodeadas por nombre.
  - **Prueba pendiente de integración del generador:** dos solicitudes mensuales de libre elección que compiten por el mismo cupo compatible, verificando que una asignación confirmada solo se utilice para reubicar una de ellas.

---

### ROSTER-02A · Feriados nacionales
- **Estado:** `Cerrado` (paso previo a **ROSTER-08**)
- **Hallazgo previo:** la aplicación no contaba aún con un calendario/tabla de feriados legales de Chile; «Generar Mes» usa `materializeTemplates` (`src/app/(dashboard)/shifts/actions.ts`) → `buildConsolidatedRequirements` (`src/app/(dashboard)/shifts/dotacion/materialize-utils.ts`).
- **Entregado:**
  - `src/lib/scheduler/v2/chile-holidays.ts`: calendario verificado de feriados legales **nacionales** de Chile para 2026 (16 feriados nacionales; fuente: `Gob.cl / LeyChile BCN`, revisión `2026-11-20`), excluyendo feriados regionales y comunales, con aviso explícito si falta el calendario de algún año y helper `isHolidayZeroStaffingPair` por coincidencia exacta de nombre completo normalizado (o pares explícitos por ID) únicamente para `Atrex — Operador de grúa`, `Base — Operador de grúa` y `Base — Supervisor`, evitando falsos positivos en nombres parecidos.
  - `src/app/(dashboard)/shifts/dotacion/materialize-utils.ts`, `src/app/(dashboard)/shifts/actions.ts`, `src/app/(dashboard)/shifts/dotacion/requirements-client.tsx`: «Generar Mes» deja en cero (omite) los cupos ordinarios de esos 3 pares en feriados nacionales y muestra `toast.warning` si falta el calendario del año seleccionado.
  - `src/lib/scheduler/v2/dotacion.ts`, `cobertura.ts`, `types.ts`, `index.ts`: al leer meses ya generados en `v2`, excluye esos 3 pares en feriados nacionales de la demanda y del cálculo de vacantes, conservando protegidos, extras manuales y demás cargos, y exponiendo `holiday_warnings`.
  - `src/lib/scheduler/v2/feriados.test.ts`: 4 pruebas unitarias con datos sintéticos (sin DB).

---

### ROSTER-08 · Vacantes en Planificación Diaria
- **Estado:** `Cerrado`
- **Entregado en motor paralelo (`src/lib/scheduler/v2/`) y UI de Planificación Diaria:**
  - `src/lib/scheduler/v2/types.ts`: `ExtraTargetType` (`'manual' | 'v2_vacancy'`), `ExtraRequirementState` (con `linked_requirement_id`), `ReconcileExtraResult`, `DailyPlanningAssignmentRef` (con `extra_target` y `linked_requirement_id`), `DailyVacancyStatus`, `DailyPlanningVacancySummary`.
  - `src/lib/scheduler/v2/vacantes-diaria.ts`:
    - `reconcileVacancyExtraRequirements`: vincula cada vacante ordinaria de `v2` (`remaining_vacancies`) con su cupo asociado en **Dotación Extra** por `(date, area_id, position_id, shift_id)` y `linked_requirement_id`, actualiza pendientes vigentes al regenerar sin duplicar registros, conserva siempre `manual_count` (extras creados manualmente) y excluye los cupos suprimidos por feriados nacionales de **ROSTER-02A**.
    - `evaluateDailyPlanningVacancies`, `buildExtraSelectorItems` y `createExtraAssignmentFromSelector`: distinguen estrictamente asignaciones a extras manuales (`extra_target: 'manual'` o heredados sin vínculo) de asignaciones a extras vinculados a una vacante (`extra_target: 'v2_vacancy'` o `linked_requirement_id` coincidente); evitan duplicar pendientes entre el panel de resumen y el selector habitual, y aseguran que cubrir un extra manual en la misma fecha, área, cargo y turno deje abierta la falta ordinaria hasta cubrir su cupo vinculado o la falta directa.
  - `docs/migrations/roster08-vacancy-extra-links.sql`: propuesta aditiva de columnas (`manual_extra_count`, `auto_vacancy_count`, `linked_requirement_id` en `shift_requirements`; `extra_target`, `linked_requirement_id` en `shift_assignments`) para ejecutar en **ROSTER-07** sin romper la restricción única actual.
  - `src/app/(dashboard)/shifts/daily/actions.ts` y `daily-planning-client.tsx`: `handleAssignExtra` en el selector habitual ahora conserva y envía `extraTarget` y `linkedRequirementId` hacia `assignExtraPersonnel` (persistencia en DB resguardada detrás de `ROSTER_V2_EXTRA_LINKS=true` para **ROSTER-07**). El panel superior muestra el estado sin duplicar selectores y la lista habitual `DOTACIÓN EXTRA` ofrece una sola vez cada pendiente (separando `VACANTE ORDINARIA` vs. `MANUAL`), manteniendo intacto el comportamiento actual para rosters del motor anterior e incluyendo el botón **"Demo Vacantes v2"** en memoria.
  - `src/lib/scheduler/v2/index.ts`: exporta `reconcileVacancyExtraRequirements`, `evaluateDailyPlanningVacancies`, `buildExtraSelectorItems`, `createExtraAssignmentFromSelector` y tipos asociados.
  - `src/lib/scheduler/v2/vacantes-diaria.test.ts`: 5 pruebas unitarias con datos sintéticos (sin DB).
- **Diagnóstico de `src/app/(dashboard)/shifts/daily/page.tsx:48`:**
  - `getDailyOperationalData(date)` retorna la unión `{ assignments, requirements } | { error: string }`; la línea 48 desestructura `{ assignments, requirements, error }` directamente sin validar `'error' in result`. Es un error preexistente de TypeScript que **no afecta** esta integración ni el motor `v2`.
- **Reglas acordadas:**
  - Al guardar un roster nuevo, mostrar de inmediato cada cupo ordinario sin cobertura como **falta** y ofrecerlo en el flujo existente de **Dotación Extra** para asignación manual.
  - Si se necesitan 3 personas y hay 2, queda 1 falta con 1 cupo extra asociado.
  - Cubrir ese cupo por cualquiera de las dos vías (asignación ordinaria sobre la falta o asignación en Dotación Extra) debe cerrar esa falta.
  - Regenerar el roster no debe duplicar pendientes ni alterar extras creados manualmente.
- **Verificaciones pendientes y trazado del flujo vigente de turno extra:**
  - **Trazado vigente (`is_extra = true`):**
    1. **Guardado desde Dotación Extra (`shifts/daily/actions.ts:332-394`):** `assignExtraPersonnel` inserta o reactiva en `shift_assignments` con `is_extra = true`, `is_manual = true`, `status = 'scheduled'`, `(date, shift_id, area_id, position_id, personnel_id)`. En `daily-operational-data.ts:94,122`, los turnos extra coexisten con el turno normal del mismo trabajador.
    2. **Visibilidad en el rol del trabajador (`(worker)/actions.ts:242`, `reports/individual-roster/actions.ts:46`, `generate-roster-pdf.ts:133`):** el rol mensual del trabajador, el reporte individual y el PDF de roster filtran explícitamente `.eq('is_extra', false)` (excluyendo el turno extra del rol ordinario).
    3. **Generación del bono (`reports/bonos/actions.ts:23-39`, `reports/extras/page.tsx:45`):** no se inserta una fila aparte en `bonus_records` al asignar el turno; el módulo de **Bonos** (`getBonosReportData`) consulta directamente `shift_assignments` donde `is_extra = true`, `status != 'cancelled'` y `attendance_status` es nulo o distinto de `'absent'`, usando `date`, `personnel_id`, `area_id`, `position_id`, `shift_id` y `paid_month` (`null` hasta su liquidación).
  - **Qué quedó verificado en ROSTER-08:** con datos sintéticos en memoria (`36/36`), tanto el extra manual (`extra_target: 'manual'`) como el vinculado (`extra_target: 'v2_vacancy'`, `linked_requirement_id`) conservan `is_extra = true` y `status = 'scheduled'`; el manual cubre su propio cupo dejando abierta la falta ordinaria, y el vinculado cierra la falta una sola vez.
  - **Qué falta comprobar con el flujo completo (en ROSTER-07):** guardado real en entorno de prueba con la migración aplicada, recarga de Planificación Diaria, ausencia en el rol del trabajador y aparición sin duplicados en el reporte de Bonos.

---

### ROSTER-06 · Comparación en vista previa
- **Estado:** `Cerrado`
- **Entregado:**
  - `src/lib/scheduler/v2/types.ts`: `EnginePreviewMetrics` y `PreviewComparisonResult` (`default_engine: 'v1'`, `dry_run: true`, `called_v1_save_route: false`, `unconfirmed_rules`).
  - `src/lib/scheduler/v2/preview-compare.ts`: `compareEnginesPreview` ejecuta ambos motores (`v1` mediante `greedyAssign` + `optimizeAssignments` en memoria sin llamar nunca a `generateSchedule`, y `v2` mediante `scheduleCrossArea`) sobre la misma dotación, disponibilidad, ausencias y turnos protegidos, midiendo cobertura principal/secundaria, vacantes, refuerzos, conflictos de jornada (`validateJornadaConstraints`), tiempos de ejecución y reglas/datos sin confirmar (`unconfirmed_rules`).
  - `src/lib/scheduler/v2/aeropuerto-ns22.ts`: `deriveNs22AnchorFromHistory` (`Ns22AnchorResolution`) usa ancla confirmada cuando está disponible (`status: 'confirmed'`); si la estima desde el historial, la marca siempre como `'provisional'`; y si el historial no permite determinar unívocamente la fase del 4x4, devuelve `'unverified'` con aviso explícito sin inventar una fase.
  - `src/lib/scheduler/v2/pagination.ts`: `fetchAllPaginated` (`PaginatedFetchResult`) carga colecciones completas mediante paginación con orden estable y aborta ante cualquier error de página sin devolver métricas parciales.
  - `src/app/(dashboard)/shifts/actions.ts`: Server Action `previewCompareSchedulers` en modo solo lectura (`select` únicamente, cero escrituras en DB); carga `shift_requirements`, `shift_assignments` y `leaves` completos mediante `fetchAllPaginated` con orden estable, abortando y mostrando el fallo si falla cualquier página; amplía la ventana histórica/mensual para semanas, domingos del mes, rachas y descansos de 12h; y pasa a `v2` titulares/anclas NS22 (distinguiendo `confirmed` / `provisional` / `unverified`), reglas de refuerzo (Aeropuerto AM07 L–V y Bodegas AM04) y calendario base.
  - `src/app/(dashboard)/shifts/roster/roster-grid-client.tsx`: botón **"Comparar v1 vs v2 (Vista Previa)"**, modal comparativo lado a lado (incluyendo `unconfirmed_rules`) y botón **"Probar Semana Sintética (NS22 + Ausencia + Protegido + Refuerzo)"** en memoria sin DB ni activación de guardado de `v2`, manteniendo `v1` (`Iniciar IA` → `runScheduler`) como opción predeterminada.
  - `src/lib/scheduler/v2/index.ts`: exporta `compareEnginesPreview`, `deriveNs22AnchorFromHistory`, `fetchAllPaginated` y tipos asociados.
  - `src/lib/scheduler/v2/preview-compare.test.ts`: 5 pruebas unitarias con datos sintéticos (sin DB), incluyendo resolución de ancla NS22 (`confirmed` / `provisional` a mitad de bloque sin reiniciar ciclo / `unverified`) y paginación multipágina con fallo en página posterior sin métricas parciales.

---

### ROSTER-07 · Activación y recuperación
- **Estado:** `En revisión`
- **Entregado (en entorno aislado, sin cambios en la base operativa y manteniendo `v1` predeterminado):**
  - `src/lib/scheduler/v2/save-recover.ts`, `src/lib/scheduler/v2/supabase-adapter.ts` y `src/lib/scheduler/v2/index.ts`:
    - `createSupabaseRosterPersistenceAdapter` conecta `saveV2Schedule` y `recoverRosterFromSnapshot` directamente con las funciones SQL `save_v2_schedule_tx` y `recover_v2_snapshot_tx` vía `supabase.rpc(...)`.
    - Control de concurrencia por marca de tiempo (`baseline_max_updated_at` / `saved_completed_at`) **y** huella de estado (`computeRangeStateHash` / `compute_roster_range_hash` en `baseline_state_hash` y `post_save_state_hash`), detectando tanto **ediciones** como **eliminaciones** hechas desde otra sesión y preservando esas modificaciones sin sobrescribirlas.
    - `getDefaultSchedulerEngine()` (`'v1'`) e `isV2SaveEnabled()` (`false`): mantienen `v1` como motor predeterminado y reversible.
    - `validateNs22OperationalConfig`: bloquea el guardado operativo si el horario (y criterio de 8h dentro de 22:00–07:00), el régimen aplicable o las anclas de al menos 2 titulares NS22 no están confirmados (`anchorStatus === 'confirmed'`).
  - `src/app/(dashboard)/shifts/actions.ts`: acciones reales `runSchedulerV2` (excluyendo borradores ordinarios reemplazables antes de invocar `scheduleCrossArea` y propagando `expectedBaselineAt` / `expectedBaselineHash`) y `recoverV2RosterAction`, resguardadas detrás de `ROSTER_V2_SAVE_ENABLED=true`.
  - `docs/migrations/roster07-activation-and-snapshots.sql`: tabla `roster_v2_snapshots` (con RLS habilitado), columnas `updated_at`, función `compute_roster_range_hash` y funciones transaccionales `save_v2_schedule_tx` y `recover_v2_snapshot_tx` con `SET search_path = public, pg_temp`, `pg_advisory_xact_lock`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` y `GRANT EXECUTE ... TO service_role` (NO ejecutadas en la base operativa hasta aprobación expresa).
  - `scripts/verify-roster07-isolated-pg.mjs`: procedimiento reproducible de validación contra una instancia aislada de Supabase/PostgreSQL. Antes de ejecutar cualquier migración, verifica por referencia de proyecto y consulta de solo lectura (`verifySqlAndApiSameIsolatedInstance`) que `TEST_DATABASE_URL` (SQL) y `TEST_SUPABASE_URL` (API REST) apunten al **mismo** proyecto aislado autorizado y aborta si falta confirmar cualquiera de los dos o si alguno apunta a `NEXT_PUBLIC_SUPABASE_URL`.
  - `src/app/(dashboard)/shifts/daily/actions.ts` (`assignExtraPersonnel`) y `src/lib/shifts/daily-operational-data.ts` (`fetchDailyOperationalData`): conservan/actualizan `extra_target` y `linked_requirement_id` al **reactivar** un extra cancelado y rechazan reasignar un extra **activo** hacia otro cupo preservando su vínculo original.
  - `src/app/(dashboard)/shifts/daily/page.tsx`: corregido el error de TypeScript en la línea 48 al desestructurar la unión de `getDailyOperationalData(date)`.
  - `src/lib/scheduler/v2/save-recover.test.ts` (5 pruebas) y `src/lib/scheduler/v2/isolated-supabase-e2e.test.ts` (4 pruebas E2E invocando `runSchedulerV2`, `recoverV2RosterAction`, `assignExtraPersonnel`, `fetchDailyOperationalData` y `getBonosReportData` vía `supabase.rpc('save_v2_schedule_tx' | 'recover_v2_snapshot_tx')`, incluyendo prueba con dos sesiones donde una edición o eliminación habitual de HRM ocurre mientras se ejecuta guardado o recuperación `v2`).
- **Verificación en solo lectura de NS22 sobre la base actual (`SELECT` únicamente) y criterio horario:**
  - **Área y turno registrados:** Área `Aeropuerto` (`c00e4729-8c71-4fe0-84d7-3956490a0ba0`), turno `NS 22` (`d57d94f1-bc99-43f5-bd74-30316c659647`, `start_time = 22:00:00`, `end_time = 07:00:00`, `duration_hours = 8`).
  - **Criterio de 8 horas dentro del intervalo 22:00 a 07:00 (confirmado):** El usuario confirmó que el turno NS22 va de `22:00` a `07:00` del día siguiente, incluye **1 hora de colación** y suma **8 horas trabajadas**. Se reutilizó `resolveShiftDurationHours` de `shift-duration.ts` en `aeropuerto-ns22.ts` y `shifts/actions.ts` (vista previa y guardado), eliminando `NS22_DEFAULT_DURATION_HOURS = 9` y conservando `07:00` como hora de salida para calcular descansos (11h hasta `18:00` rechazado vs 12h hasta `19:00` permitido) y día saliente.
  - **Respaldo de anclas y régimen de los titulares:**
    1. **JAVIER IGNACIO LOPEZ** (`dafef0b7-cbab-4eaa-8aec-88ae7b4848d3`): `rotation_pattern = "4x4_noche"`, `fixed_shift_id = d57d94f1-bc99-43f5-bd74-30316c659647`, `contract_type = "INDEFINIDO"`, `has_special_contract = false`, 112 noches en bloques exactos de 4 (`2026-04-30` a `2026-12-05`; ancla de inicio de bloque `2026-04-30`, equivalente mod 8 a `2026-11-08`).
    2. **MARCELO ANDRES JARA** (`1e2cc199-7a29-417f-86d3-58143d448654`): `rotation_pattern = "4x4_noche"`, `fixed_shift_id = d57d94f1-bc99-43f5-bd74-30316c659647`, `contract_type = "INDEFINIDO"`, `has_special_contract = false`, 109 noches en bloques alternados de 4 (`2026-04-27` a `2026-12-06`; ancla de inicio de bloque `2026-04-26` / primer bloque `2026-04-27..04-29`, equivalente mod 8 a `2026-11-04`).
  - **Confirmación del régimen aplicable (registrada por separado):** Ambos titulares tienen `has_special_contract = false` sin un régimen excepcional confirmado (`art_38_exceptional` / `special_confirmed`) en `personnel`, por lo que la confirmación del régimen 4x4 aplicable queda registrada por separado como **pendiente de validación expresa** y mantiene bloqueado el guardado operativo `v2`.
- **Estado de pruebas con PostgreSQL real vs entorno aislado:**
  - **Probado en entorno aislado en memoria (`51/51`):** `runSchedulerV2` → `supabase.rpc('save_v2_schedule_tx')`, recarga de Planificación Diaria (`fetchDailyOperationalData`), `recoverV2RosterAction` → `supabase.rpc('recover_v2_snapshot_tx')`, rollback transaccional ante fallo intermedio, prueba con dos sesiones reproduciendo una edición o eliminación habitual de HRM mientras se ejecuta el guardado o la recuperación `v2` (preservando el cambio ajeno y abortando sin cambios parciales), flujo completo de Dotación Extra (`assignExtraPersonnel` nuevo y reactivado, exclusión del rol ordinario, aparición única en `getBonosReportData`), cómputo de 8h para NS22 sin `duration_hours` guardado conservando salida `07:00` (11h vs 12h), y `v1` como predeterminado.
  - **Bloqueo registrado para PostgreSQL real:** En esta máquina no existe PostgreSQL local, Docker, Supabase CLI ni una instancia aislada de Supabase disponible (`.env.local` apunta únicamente a la base operativa, excluida de estas pruebas). Queda preparado el procedimiento reproducible en `scripts/verify-roster07-isolated-pg.mjs` (con verificación previa de coincidencia SQL + API en el mismo proyecto aislado).
- **Condiciones pendientes antes de habilitar `v2` en operación:**
  1. Aprobación expresa del usuario para aplicar `docs/migrations/roster08-vacancy-extra-links.sql` y `docs/migrations/roster07-activation-and-snapshots.sql` en la base operativa.
  2. Confirmación explícita del régimen `4x4_noche` / jornada excepcional aplicable a los dos titulares NS22 (horario `22:00-07:00` con 1h de colación = 8h trabajadas ya confirmado).
  3. Ejecución de `scripts/verify-roster07-isolated-pg.mjs` en instancia aislada de Supabase/PostgreSQL.
  4. Habilitación controlada de `ROSTER_V2_EXTRA_LINKS=true` y `ROSTER_V2_SAVE_ENABLED=true` (manteniendo `v1` predeterminado hasta confirmar operación).

---

### ROSTER-09 · Cálculo de dotación nocturna de Blue Express
- **Estado:** `En revisión` (integrado en **Generar Mes**; vista previa del roster real pendiente)
- **Identificadores verificados en HRM (`SELECT` únicamente):**
  - Área: `BlueExpress` (`1e805b0f-6d6c-471e-bad9-c48669342735`)
  - Turno nocturno: `AM 00` (`2647633b-6e10-4c1a-bd39-35facb3409ac`, `00:00:00–08:30:00`, `duration_hours = 7.5`)
  - Cargos: `Conductor Camion` (`05127d36-1826-446b-ba2a-e647e85b4f20`) y `Ayudante` (`32a2cafd-3d72-4d2e-99e5-727323dfd1a8`)
- **Entregado:**
  - `src/lib/scheduler/v2/blue-express.ts` y `src/lib/scheduler/v2/index.ts`: `getTwoMonthHistoryWindow`, `calculateBlueExpressNightStaffingProposal`, `getInitialApprovedTrucksByWeekday`, `isBlueExpressAm00Slot`, `validateApprovedTrucksByWeekday` y `buildBlueExpressApplyPlan`.
  - `src/app/(dashboard)/shifts/actions.ts`: `previewBlueExpressNightStaffing` y `materializeTemplates(startDate, endDate, { blueExpressApprovedByWeekday })` integrados: excluyen `BlueExpress AM 00` (`Conductor Camion` y `Ayudante`) de la inserción genérica de la Matriz Semanal y aplican la pauta aprobada/editada en pantalla, manteniendo la Matriz Semanal para los demás turnos/áreas y conservando turnos diurnos, extras y asignaciones del roster.
  - `src/app/(dashboard)/shifts/dotacion/requirements-client.tsx`: flujo unificado desde el botón **Generar Mes** (calcula automáticamente la propuesta editable `1–3` camiones por noche de lunes a domingo antes de guardar; para `2026-12-07..2027-01-03` muestra `3, 2, 2, 1, 2, 1, 1` con `48` cupos de Conductor y `48` de Ayudante, y recalcula pautas nuevas para meses futuros).
  - `src/lib/scheduler/v2/blue-express.test.ts`: 5 pruebas unitarias (tendencia `1–3`, día sin historial, extra vigente, turno cancelado, pauta aprobada `48/48`, aceptación automática vs edición en pantalla, y recálculo en mes futuro).
- **Propuesta calculada con datos de HRM (`2026-10-01` al `2026-11-19`, 50 noches transcurridas) para `2026-12-07` al `2027-01-03`:**
  - **Modo:** `Estimación por duplas del roster` (158 registros sin `attendance_status` confirmado; 0 requerimientos ordinarios generados en `2026-12-07..2027-01-03`).
  - **Lunes:** `3` camiones (`3` Cond. / `3` Ayud.) — últimas 3 `[3, 3, 3]`
  - **Martes:** `3` camiones (`3` Cond. / `3` Ayud.) — moda 2 meses (`[2, 3, 1, 3, 2, 3, 0]`)
  - **Miércoles:** `2` camiones (`2` Cond. / `2` Ayud.) — últimas 3 `[2, 2, 2]`
  - **Jueves:** `1` camión (`1` Cond. / `1` Ayud.) — últimas 3 `[1, 1, 1]`
  - **Viernes:** `2` camiones (`2` Cond. / `2` Ayud.) — moda 2 meses (`[2, 3, 2, 2, 1, 1, 3]`)
  - **Sábado:** `1` camión (`1` Cond. / `1` Ayud.) — empate `0/1`, mínimo obligatorio `1`
  - **Domingo:** `1` camión (`1` Cond. / `1` Ayud.) — últimas 3 `[0, 0, 0]`, mínimo obligatorio `1`
  - **Totales historial:** `39` noches con duplas > 0, `0` sin datos, `11` con cero confirmados, `67` cancelaciones, `5` ausencias, `6` duplas incompletas, `23` extras vigentes incluidos. **Total propuesto (4 semanas):** `52` noches-camión (`52` conductores + `52` ayudantes).

---

## 5. Registro de cierres

| Ticket | Fecha | Lo entregado | Prueba realizada | Resultado | Siguiente ticket |
|---|---|---|---|---|---|
| **ROSTER-01** | 2026-11-20 | Creación de `docs/plan-roster.md` con tablero de tickets, reglas de seguimiento, diagnóstico en solo lectura del motor actual y verificaciones pendientes. | Revisión en solo lectura del código de `src/lib/scheduler/*`, `shifts/actions.ts`, `roster-grid-client.tsx`, `dotacion/materialize-utils.ts` y `daily-operational-data.ts` + aprobación del usuario. | Aprobado por el usuario (con precisión sobre lectura de `priority` en `shift_requirements`). | **ROSTER-02** |
| **ROSTER-02** | 2026-11-20 | Módulo de dotación y cobertura del motor paralelo (`src/lib/scheduler/v2/types.ts`, `dotacion.ts`, `index.ts`, `dotacion.test.ts`), manteniendo intacto el motor actual y sin escrituras en DB. | 4 pruebas unitarias con `node --test` sobre datos sintéticos + `npx tsc --noEmit`. | 4/4 pruebas aprobadas (`pass 4, fail 0`) y `tsc --noEmit` sin errores (`exit code 0`). Aprobado por el usuario. | **ROSTER-03** |
| **ROSTER-03** | 2026-11-20 | Módulo de jornada, descansos y permisos del motor paralelo (`src/lib/scheduler/v2/jornada.ts`, `types.ts`, `index.ts`, `jornada.test.ts`), manteniendo intacto el motor actual y sin escrituras en DB. | 8 pruebas unitarias de ROSTER-03 + 4 de ROSTER-02 con `node --test` sobre datos sintéticos + `npx tsc --noEmit`. | 12/12 pruebas aprobadas (`pass 12, fail 0`) y `tsc --noEmit` sin errores. Aprobado por el usuario. | **ROSTER-04** |
| **ROSTER-04** | 2026-11-20 | Módulo de Aeropuerto NS22 (`src/lib/scheduler/v2/aeropuerto-ns22.ts`, `types.ts`, `index.ts`, `aeropuerto-ns22.test.ts`), manteniendo intacto el motor actual y sin escrituras en DB. | 7 pruebas unitarias de ROSTER-04 + 8 de ROSTER-03 + 4 de ROSTER-02 con `node --test` sobre datos sintéticos + `npx tsc --noEmit`. | 19/19 pruebas aprobadas (`pass 19, fail 0`) y `tsc --noEmit` sin errores. Aprobado por el usuario. | **ROSTER-05** |
| **ROSTER-05** | 2026-11-20 | Secuencia de 5 etapas de cobertura entre áreas y refuerzos (`src/lib/scheduler/v2/cobertura.ts`, `aeropuerto-ns22.ts`, `types.ts`, `index.ts`, `jornada.ts`, `cobertura.test.ts`), manteniendo intacto el motor actual y sin escrituras en DB. | 8 pruebas unitarias de ROSTER-05 + 7 de ROSTER-04 + 8 de ROSTER-03 + 4 de ROSTER-02 con `node --test` sobre datos sintéticos + `npx tsc --noEmit`. | 27/27 pruebas aprobadas (`pass 27, fail 0`) y `tsc --noEmit` sin errores. Aprobado por el usuario. | **ROSTER-02A** |
| **ROSTER-02A** | 2026-11-20 | Calendario nacional verificado de Chile (`chile-holidays.ts`), exclusión de los 3 pares exactos en «Generar Mes» (`materialize-utils.ts`, `actions.ts`, `requirements-client.tsx`) y en cálculo de demanda/vacantes `v2` (`dotacion.ts`, `cobertura.ts`, `feriados.test.ts`), manteniendo intacto el motor actual y su guardado. | 4 pruebas unitarias de ROSTER-02A + 27 pruebas previas de `v2` con `node --test` sobre datos sintéticos + `npx tsc --noEmit`. | 31/31 pruebas aprobadas (`pass 31, fail 0`); 0 errores de TypeScript en archivos nuevos/modificados (`tsc --noEmit` solo reporta el error preexistente en `shifts/daily/page.tsx:48`). Aprobado por el usuario. | **ROSTER-08** |
| **ROSTER-08** | 2026-11-20 | Vínculo explícito entre vacantes ordinarias de `v2` y Dotación Extra (`vacantes-diaria.ts`, `types.ts`, `index.ts`, `vacantes-diaria.test.ts`, migración documentada `docs/migrations/roster08-vacancy-extra-links.sql`, selector habitual conectado en `daily/actions.ts` y `daily-planning-client.tsx` sin duplicar pendientes) + trazado completo de `is_extra = true` hacia rol del trabajador y bonos. | 5 pruebas unitarias de ROSTER-08 (incluyendo prueba del selector habitual en memoria) + 31 pruebas previas de `v2` con `node --test` sobre datos sintéticos + `npx tsc --noEmit`. | 36/36 pruebas aprobadas (`pass 36, fail 0`); 0 errores de TypeScript en archivos nuevos/modificados (`tsc --noEmit` solo reporta el error preexistente en `shifts/daily/page.tsx:48`, que no afecta esta integración). Aprobado por el usuario. | **ROSTER-06** |
| **ROSTER-06** | 2026-11-20 | Comparación lado a lado en vista previa `v1` vs `v2` sin escrituras (`preview-compare.ts`, `types.ts`, `aeropuerto-ns22.ts` con `deriveNs22AnchorFromHistory`, `pagination.ts` con `fetchAllPaginated`, `index.ts`, `preview-compare.test.ts`, Server Action `previewCompareSchedulers` en `shifts/actions.ts` con paginación completa con orden estable, aborto ante error de página y paso de NS22/refuerzos/calendario base, y modal comparativo + prueba sintética en pantalla en `roster-grid-client.tsx`), manteniendo `v1` como predeterminado. | 5 pruebas unitarias de ROSTER-06 (incluyendo semana sintética, ancla NS22 confirmada/provisional a mitad de bloque/no verificable y paginación multipágina + fallo en página posterior) + 36 pruebas previas de `v2` con `node --test` sobre datos sintéticos + `npx tsc --noEmit`. | 41/41 pruebas aprobadas (`pass 41, fail 0`); 0 errores de TypeScript en archivos nuevos/modificados. Aprobado por el usuario. | **ROSTER-07** |
| **ROSTER-07** | *(En revisión)* | Guardado y recuperación transaccional `v2` conectado a `save_v2_schedule_tx` y `recover_v2_snapshot_tx` vía `createSupabaseRosterPersistenceAdapter`, endurecimiento SQL (`SET search_path`, `pg_advisory_xact_lock`, RLS y `REVOKE/GRANT` a `service_role`), procedimiento reproducible en instancia aislada (`scripts/verify-roster07-isolated-pg.mjs`), prueba de dos sesiones durante guardado/recuperación, corrección de duración NS22 con `resolveShiftDurationHours` (8h con 1h colación y salida `07:00` sin fallback de 9h) y corrección TS `shifts/daily/page.tsx:48`, manteniendo `v1` predeterminado y guardado `v2` deshabilitado. | 5 pruebas de `save-recover.test.ts` + 4 pruebas E2E de `isolated-supabase-e2e.test.ts` + prueba de duración 8h y descanso 11h/12h en `aeropuerto-ns22.test.ts` + 41 pruebas previas de `v2` con `node --test` + `node --check scripts/verify-roster07-isolated-pg.mjs` + `npx tsc --noEmit`. | 51/51 pruebas aprobadas (`pass 51, fail 0`); `npx tsc --noEmit` con 0 errores (`exit code 0`). Confirmado el cómputo de 8h de NS22; pendiente instancia aislada para PostgreSQL real, confirmación del régimen 4x4 y aprobación expresa para operar en producción. | **ROSTER-09** |
| **ROSTER-09** | *(En revisión)* | Integración completa de Blue Express AM 00 en **Generar Mes** (`blue-express.ts`, `blue-express.test.ts`, `materializeTemplates` + `previewBlueExpressNightStaffing` en `shifts/actions.ts` y flujo unificado editable en `requirements-client.tsx`) con pauta `3,2,2,1,2,1,1` (`48/48`) para `2026-12-07..2027-01-03` y recálculo automático para meses futuros. | 5 pruebas unitarias de `blue-express.test.ts` + 1 prueba de `range-delete-utils.test.ts` + 51 pruebas previas de `v2` con `node --test` + `npx tsc --noEmit`. | 57/57 pruebas aprobadas (`pass 57, fail 0`); `npx tsc --noEmit` con 0 errores (`exit code 0`). Vista previa del roster real pendiente. | — |
| **ROSTER-03 / Cumpleaños y Feriados** | 2026-11-20 | Regla de **cumpleaños como día libre obligatorio** desde `birth_date` (`types.ts`, `jornada.ts`, `aeropuerto-ns22.ts`, `cobertura.ts`, `preview-compare.ts`, `shifts/actions.ts`) con carga para ambos motores (`v1` y `v2`), validación de día completo incluyendo cruce de medianoche, búsqueda de reemplazo NS22 sin mover el ciclo 4x4, conflicto para revisión cuando coincide con turno protegido, y reubicación/pendiente según calendario base; además de integración previa de feriados nacionales 2026–2027 en **Generar Mes** (`chile-holidays.ts`, `requirements-client.tsx`). | Prueba de cumpleaños en día laboral (reubicación y pendiente), día ya libre, turno nocturno que cruza medianoche, conflicto con turno protegido y comparación `v1`/`v2` en `jornada.test.ts` + prueba de cruce de año 2026–2027 y bloqueo de año sin cobertura en `feriados.test.ts` + 57 pruebas previas con `node --test` + `npx tsc --noEmit`. | 60/60 pruebas aprobadas (`pass 60, fail 0`); `npx tsc --noEmit` con 0 errores (`exit code 0`). Comparación real del **7 de diciembre al 3 de enero** pendiente. | — |
| **ROSTER-06 / Rendimiento y Cancelación** | 2026-11-24 | Vista previa comparativa con etapas reales en streaming (`/api/shifts/preview-compare`), barra animada sin porcentaje, contador de tiempo transcurrido, bloqueo de **Comparar** e **Iniciar IA**, modal contenido en pantalla (`max-h-[90vh] overflow-y-auto`), caché incremental en `cobertura.ts` (con detección de domingos por fechas ocupadas en `getTouchedSundayMonths`, incluido NS22 de sábado) y `jornada.ts`, e interrupción cooperativa síncrona/asíncrona tanto en `v1` (`greedyAssignAsync`, `optimizeAssignmentsAsync`) como en `v2` (`scheduleCrossAreaAsync`) ante `AbortSignal`, `ReadableStream.cancel()` o límite `115 s` servidor / `120 s` cliente. | Medición sintética `v2` (48 personas × 24 cupos/día, sin DB): **7 días** (`168` cupos, 100% cobertura, `0` violaciones): selección `3824.52 ms`, reasignaciones `0.24 ms`, auditoría final `57.46 ms`, total `3940.64 ms` (`3.94 s`). **28 días** (`672` cupos, 100% cobertura, `0` violaciones): selección `19635.50 ms`, reasignaciones `0.09 ms`, auditoría final `234.52 ms`, total `19892.76 ms` (`19.89 s`). Pruebas adicionales: domingos >8 días con NS22 sábado; L–D igual prioridad con polivalente (`7/7` cubiertos, `0` vacantes, `3` refuerzos (Lun/Mié/Vie)); dotación ajustada semanal; cancelación durante `v1`, durante `v2` y vía `ReadableStream.cancel()` (`< 300 ms`) + `npx tsc --noEmit`. | 69/69 pruebas aprobadas (`pass 69, fail 0`); `npx tsc --noEmit` con 0 errores. Pendiente aprobación para push y comparación real. | — |

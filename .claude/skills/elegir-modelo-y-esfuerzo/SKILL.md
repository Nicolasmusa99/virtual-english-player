---
name: elegir-modelo-y-esfuerzo
description: "Dada una tarea o pregunta de Nico, recomienda qué modelo (Sonnet/Opus, con Haiku como opción para lo trivial) y qué nivel de esfuerzo (low/medium/high/xhigh/max) usar, priorizando no gastar de más. Usar cuando pregunte qué modelo usar para algo, pegue una tarea y pida un chequeo rápido de presupuesto, o antes de lanzar algo pesado (research largo, workflow multi-agente, proceso batch) para confirmar que no está usando una bazuka para una mosca."
---

# Elegir modelo y nivel de esfuerzo

## Trigger

Activar cuando Nico:
- Pregunte directamente qué modelo o esfuerzo conviene para una tarea.
- Pegue una tarea/pregunta y pida "con esto qué uso" o similar.
- Esté por lanzar algo costoso (research extenso, workflow multi-agente, proceso batch) y quiera confirmar que no se está pasando de rosca.
- Diga que probó algo con Sonnet (o el nivel de esfuerzo actual) y el resultado quedó corto — ahí el paso de escalada aplica directo, sin repetir el diagnóstico desde cero.

## Tabla rápida (usar esto primero; si la tarea no encaja clara, pasar a los Steps)

| Tipo de tarea | Modelo | Esfuerzo |
|---|---|---|
| Navegar/clickear webs, extraer texto plano | Sonnet (o Haiku si es MUY repetitivo) | low |
| Subagentes en loop, tareas de alto volumen | Sonnet (o Haiku) | low/medium |
| Código de rutina, refactors, resúmenes, procesar datos | Sonnet | medium/high |
| Ejecutar un plan ya definido, aunque tenga muchos pasos | Sonnet | high |
| Coding difícil, razonamiento complejo con camino no obvio | Sonnet | high |
| Trabajo agéntico largo (30+ min) o con presupuesto grande de tokens | Sonnet | xhigh |
| Diseño de arquitectura desde cero, debugging sin pista de por dónde arrancar | Opus | high |
| Ambigüedad real / trade-offs no obvios donde un error sale caro de deshacer | Opus | high (subir a max solo si high se queda corto) |

## Steps (cuando la tabla no alcanza)

1. Si la tarea no está clara, pedir en una frase: qué hay que producir y cuánta ambigüedad tiene (¿hay un camino obvio o hay que decidir entre trade-offs?).

2. Test de modelo: "¿un junior con buenas instrucciones lo resuelve bien?"
   - Sí → **Sonnet** (o **Haiku** si además es tan mecánico/repetitivo que ni un junior necesita pensar — alto volumen, formato fijo, cero ambigüedad).
   - No (ambigüedad real, trade-offs no obvios, error de razonamiento caro de deshacer, arquitectura desde cero, debugging sin pista) → **Opus**.

3. Esfuerzo dentro de ese modelo:
   - **low**: mecánico/repetitivo, subagente, alto volumen — prioriza velocidad/costo.
   - **medium**: agéntico balanceado, sin mucha complejidad.
   - **high** (default): razonamiento complejo, coding difícil, la mayoría de tareas serias.
   - **xhigh**: agéntico largo (30+ min), presupuestos grandes de tokens.
   - **max**: capacidad máxima sin restricción, solo para el análisis más exigente.

4. Regla de escalada (evita saltar directo a Opus): arrancar en Sonnet + high. Si el resultado es mediocre o se traba en un matiz, subir el esfuerzo dentro de Sonnet (medium→high→xhigh→max) antes de cambiar de modelo. Recién si eso no alcanza, pasar a Opus (empezando en high, no en max).

5. Recordatorio de costo: Opus sale ~2.5x Sonnet (input y output), y el output siempre sale ~5x más caro que el input en cualquier modelo — tenerlo presente al justificar el "por qué", sobre todo en tareas de alto volumen o mucho output.

## Formato de respuesta (fijo, no variar)

```
Modelo: <Sonnet/Opus/Haiku>
Esfuerzo: <low/medium/high/xhigh/max>
Por qué: <una frase>
```

Nada de ensayo ni de repetir el razonamiento completo salvo que Nico pida el detalle.

## Verification

- La recomendación usa el formato fijo de 3 líneas.
- Nunca recomienda Opus o esfuerzo alto para algo mecánico o de bajo riesgo.
- Si Nico ya dijo que probó un nivel y quedó corto, escala directo (esfuerzo primero, modelo después) sin repetir todo el diagnóstico.
- Si la tarea es ambigua en sí misma, lo primero es pedir la aclaración de la tarea, no adivinar el modelo.
- Antes de recomendar Haiku, confirmar que la tarea es realmente mecánica y de alto volumen — no usarlo por defecto solo porque es lo más barato.

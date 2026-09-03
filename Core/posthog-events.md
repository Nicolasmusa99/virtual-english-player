# PostHog Event Schema — Virtual English Player

All events should be fired from app/page.tsx client-side. Use
posthog.capture(eventName, properties) after integrating the PostHog JS
SDK.

------------------------------------------------------------------------

## Estado de implementación — auditoría 2026-09-03

El wrapper real de analítica es `capture(event, props)` en
`lib/capture.ts` (delega en `window.__ve_posthog.capture`). Ground truth
verificado con `grep -rn "capture(" app lib`: **40** nombres de evento
únicos disparan realmente en el código (46 call sites menos 3 del propio
wrapper). De los **46** eventos que este documento define, **22** están
instrumentados, **24 NO** y **18** eventos reales no estaban
documentados (se agregan más abajo).

**Eventos documentados SIN `capture()` en el código — [No implementado —
verificado 2026-09-03].** Los siguientes 24 eventos (la tanda "core" del
player) están especificados abajo pero nunca se cablearon; `grep` de
cada nombre en `app/` + `lib/` devuelve 0 ocurrencias. La "Nota de
alcance (2026-07-11)" del final reconcilió 13 eventos agregados después
(que sí disparan) pero no marcó que esta tanda base seguía sin
instrumentar. Quedan como **backlog de instrumentación pendiente** (no se
eliminan; la especificación sigue vigente):

`video_loaded`, `transcription_started`, `transcription_upload_complete`,
`transcription_succeeded`, `transcription_failed`,
`transcription_cancelled`, `srt_loaded_from_file`, `srt_downloaded`,
`player_opened`, `playback_toggled`, `phrase_navigated`,
`phrase_repeated`, `micro_repeat_used`, `subtitles_toggled`,
`playback_speed_changed`, `subtitle_delay_changed`,
`subtitle_delay_reset`, `phrase_selection_toggled`,
`phrase_list_filter_changed`, `phrase_edited`, `phrase_edit_cancelled`,
`player_exited`, `progress_bar_scrubbed`, `volume_changed`.

> El encabezado de cada uno de esos 24 eventos, más abajo, debe leerse
> con el marcador **[No implementado — verificado 2026-09-03]** aplicado.

**Eventos instrumentados (22):** `session_autosaved`,
`session_restore_prompted`, `session_restore_resolved`,
`exit_confirmation_shown`, `exit_confirmation_resolved`,
`autopause_toggled`, `autopause_triggered`, `practice_mode_toggled`,
`practice_mode_completed`, `phrase_loop_changed`,
`text_visibility_toggled`, `phrase_timestamps_edited`, `phrase_split`,
`phrase_merged`, `phrase_added`, `phrase_deleted`,
`phrases_bulk_selection`, `srt_loaded_in_player`, `phrase_tick_clicked`,
`upload_size_warning_shown`, `stage_window_opened`, `stage_window_closed`.

**Eventos reales que faltaban en este documento (18)** — agregados en las
secciones "Eventos de Biblioteca (Bloque 13)" y "Eventos de VE Drills
(Bloques 14–16)" antes de la nota final.

------------------------------------------------------------------------

## video_loaded

**Trigger:** User drops or selects files and a valid video is identified
in handleFiles(). **Screen:** SCR-001 (Load Screen)

| **Property** | **Type** | **Description**                           |
|:-------------|----------|-------------------------------------------|
| file_name    | string   | Original filename (e.g. “lesson.mp4”)     |
| file_size_mb | number   | File size in megabytes (1 decimal)        |
| mime_type    | string   | MIME type reported by the browser         |
| has_srt      | boolean  | Whether an SRT file was dropped alongside |

## transcription_started

**Trigger:** transcribe() is called — XHR is opened and sent.
**Screen:** SCR-003 (Load — uploading)

| **Property** | **Type** | **Description** |
|:-------------|----------|-----------------|
| file_name    | string   | Video filename  |
| file_size_mb | number   | File size in MB |
| mime_type    | string   | MIME type       |

## transcription_upload_complete

**Trigger:** xhr.upload.onloadend fires — video upload to the server is
done. **Screen:** SCR-004 (Load — transcribing)

| **Property**       | **Type** | **Description**                               |
|:-------------------|----------|-----------------------------------------------|
| file_name          | string   | Video filename                                |
| file_size_mb       | number   | File size in MB                               |
| upload_duration_ms | number   | Time from transcription_started to this event |

## transcription_succeeded

**Trigger:** Server responds with a valid SRT and parseSRT returns at
least 1 phrase. **Screen:** SCR-004 → SCR-005

| **Property**      | **Type** | **Description**                               |
|:------------------|----------|-----------------------------------------------|
| file_name         | string   | Video filename                                |
| phrase_count      | number   | Number of phrases parsed                      |
| total_duration_ms | number   | Time from transcription_started to this event |
| srt_source        | string   | Always “gemini” here                          |

## transcription_failed

**Trigger:** Server returns an error, network error fires, or parseSRT
returns 0 phrases. **Screen:** SCR-002 (Load — error)

| **Property**  | **Type**       | **Description**                          |
|:--------------|----------------|------------------------------------------|
| file_name     | string         | Video filename                           |
| error_message | string         | The error string shown to the user       |
| http_status   | number \| null | HTTP status code if available, else null |

## transcription_cancelled

**Trigger:** User clicks “Cancelar” in cancelTranscription().
**Screen:** SCR-003 or SCR-004

| **Property** | **Type** | **Description** |
|:---|----|----|
| file_name | string | Video filename |
| step_at_cancel | string | Value of step at cancel time (“uploading” or “transcribing”) |
| progress_at_cancel | number | Progress bar percentage at cancel time |

## srt_loaded_from_file

**Trigger:** An SRT file is parsed directly in the browser (video + SRT
dropped together). **Screen:** SCR-001 → SCR-005

| **Property** | **Type** | **Description**          |
|:-------------|----------|--------------------------|
| file_name    | string   | SRT filename             |
| phrase_count | number   | Number of phrases parsed |

## srt_downloaded

**Trigger:** User clicks “↓ SRT” in the player top bar (downloadSRT()),
OR auto-download fires after transcription. **Screen:** SCR-005

| **Property** | **Type** | **Description** |
|:---|----|----|
| file_name | string | Downloaded .srt filename |
| phrase_count | number | Number of phrases in the file |
| trigger | string | “auto” (post-transcription) or “manual” (button click) |

## player_opened

**Trigger:** screen transitions to ‘player’ (either after transcription
or SRT parse). **Screen:** SCR-005

| **Property**    | **Type** | **Description**      |
|:----------------|----------|----------------------|
| video_file_name | string   | Video filename       |
| phrase_count    | number   | Total phrases loaded |
| srt_source      | string   | “gemini” or “file”   |

## playback_toggled

**Trigger:** togglePlay() is called (button click or Space key).
**Screen:** SCR-005

| **Property**   | **Type** | **Description**                           |
|:---------------|----------|-------------------------------------------|
| action         | string   | “play” or “pause”                         |
| trigger        | string   | “button” or “keyboard”                    |
| current_time_s | number   | video.currentTime at the moment of toggle |

## phrase_navigated

**Trigger:** jumpTo() is called via “Anterior”/“Siguiente” buttons or
A/D keys. **Screen:** SCR-005

| **Property** | **Type** | **Description**        |
|:-------------|----------|------------------------|
| direction    | string   | “prev” or “next”       |
| trigger      | string   | “button” or “keyboard” |
| from_index   | number   | Previous curIdx        |
| to_index     | number   | New curIdx             |

## phrase_repeated

**Trigger:** repeatPhrase() is called (R key or “Repetir” button).
**Screen:** SCR-005

| **Property** | **Type** | **Description**              |
|:-------------|----------|------------------------------|
| trigger      | string   | “button” or “keyboard”       |
| phrase_index | number   | Index of the repeated phrase |

## micro_repeat_used

**Trigger:** microRepeat() is called (W key or “Micro-rep.” button).
**Screen:** SCR-005

| **Property** | **Type** | **Description**                              |
|:-------------|----------|----------------------------------------------|
| trigger      | string   | “button” or “keyboard”                       |
| phrase_index | number   | Current phrase index                         |
| seek_back_s  | number   | Actual seconds seeked back (before clamping) |

## subtitles_toggled

**Trigger:** User clicks the CC toggle button (setCcOn). **Screen:**
SCR-005, SCR-006, SCR-007

| **Property** | **Type** | **Description** |
|:-------------|----------|-----------------|
| new_state    | string   | “on” or “off”   |

## playback_speed_changed

**Trigger:** setSpd() is called. **Screen:** SCR-005

| **Property**   | **Type** | **Description**               |
|:---------------|----------|-------------------------------|
| speed          | number   | New playback rate (e.g. 0.75) |
| previous_speed | number   | Previous playback rate        |

## subtitle_delay_changed

**Trigger:** adjDelay() is called. **Screen:** SCR-005

| **Property** | **Type** | **Description**            |
|:-------------|----------|----------------------------|
| new_delay_s  | number   | New delay value in seconds |
| direction    | string   | “increase” or “decrease”   |

## subtitle_delay_reset

**Trigger:** User clicks “reset” link in the delay section. **Screen:**
SCR-005

| **Property**     | **Type** | **Description**          |
|:-----------------|----------|--------------------------|
| previous_delay_s | number   | Delay value before reset |

## phrase_selection_toggled

**Trigger:** toggleSel() is called (checkbox click on a phrase row).
**Screen:** SCR-005, SCR-009

| **Property**   | **Type** | **Description**                        |
|:---------------|----------|----------------------------------------|
| phrase_index   | number   | Index of the phrase toggled            |
| new_state      | string   | “selected” or “deselected”             |
| total_selected | number   | Total selected count after this action |

## phrase_list_filter_changed

**Trigger:** User clicks “Todas” or “Sel.” filter button. **Screen:**
SCR-005, SCR-009

| **Property**   | **Type** | **Description**                     |
|:---------------|----------|-------------------------------------|
| new_filter     | string   | “all” or “sel”                      |
| selected_count | number   | Number of phrases in the “sel.” set |

## phrase_edited

**Trigger:** saveEdit() is called (user confirms a phrase text change).
**Screen:** SCR-008

| **Property** | **Type** | **Description**             |
|:-------------|----------|-----------------------------|
| phrase_index | number   | Index of the edited phrase  |
| old_length   | number   | Character count of old text |
| new_length   | number   | Character count of new text |

## phrase_edit_cancelled

**Trigger:** cancelEdit() is called (Escape key or ✕ button).
**Screen:** SCR-008

| **Property** | **Type** | **Description**                              |
|:-------------|----------|----------------------------------------------|
| phrase_index | number   | Index of the phrase whose edit was cancelled |

## player_exited

**Trigger:** backToLoad() is called — user clicks “← Cargar otro”.
**Screen:** SCR-005

| **Property**       | **Type** | **Description**                |
|:-------------------|----------|--------------------------------|
| video_file_name    | string   | Video that was loaded          |
| session_duration_s | number   | Seconds since player_opened    |
| phrases_count      | number   | Total phrases that were loaded |
| selected_count     | number   | Phrases selected at exit       |

## progress_bar_scrubbed

**Trigger:** scrub() is called (click on the progress track).
**Screen:** SCR-005

| **Property** | **Type** | **Description**                |
|:-------------|----------|--------------------------------|
| seek_to_s    | number   | Target currentTime after scrub |
| from_s       | number   | currentTime before scrub       |

## volume_changed

**Trigger:** Volume range input onChange fires. **Screen:** SCR-005

| **Property**   | **Type** | **Description**        |
|:---------------|----------|------------------------|
| new_volume_pct | number   | New volume 0–100       |
| trigger        | string   | “slider” or “keyboard” |

## session_autosaved

**Trigger:** Debounced autosave writes session state to localStorage
(US-023). **Screen:** SCR-005

| **Property**    | **Type** | **Description**               |
|:----------------|----------|-------------------------------|
| video_file_name | string   | Video the session belongs to  |
| phrase_count    | number   | Phrases in the saved state    |
| selected_count  | number   | Selected phrases at save time |

## session_restore_prompted

**Trigger:** A matching saved session is found on video load (US-024).
**Screen:** SCR-010

| **Property**       | **Type** | **Description**              |
|:-------------------|----------|------------------------------|
| video_file_name    | string   | Loaded video filename        |
| saved_phrase_count | number   | Phrases in the saved session |

## session_restore_resolved

**Trigger:** User clicks “Restaurar” or “Descartar” (US-024).
**Screen:** SCR-010

| **Property** | **Type** | **Description** |
|:---|----|----|
| action | string | **\[Corregido 2026-07-11\]** “restore” or “discard” (el código usa estos valores exactos; el doc anterior decía “restored”/“dismissed”, que no coincidía) |
| video_file_name | string | Loaded video filename |

## exit_confirmation_shown

**Trigger:** “← Cargar otro” clicked while dirty = true (US-025).
**Screen:** SCR-011

| **Property**   | **Type** | **Description**                |
|:---------------|----------|--------------------------------|
| has_edits      | boolean  | Whether inline edits exist     |
| selected_count | number   | Selected phrases at the moment |

## exit_confirmation_resolved

**Trigger:** User clicks one of the three exitDialog buttons (US-025).
**\[Instrumentado 2026-07-11 — quedó documentado sin implementar desde
junio; ahora está en los 3 onClick del diálogo\]** **Screen:** SCR-011

| **Property** | **Type** | **Description** |
|:---|----|----|
| action | string | “download_and_exit”, “exit_without_saving” or “cancel” |

## autopause_toggled

**Trigger:** User toggles the “Auto-pausa” control (US-026).
**\[Instrumentado 2026-07-11\]** **Screen:** SCR-005, SCR-012

| **Property** | **Type** | **Description** |
|:-------------|----------|-----------------|
| new_state    | string   | “on” or “off”   |

## autopause_triggered

**Trigger:** Playback auto-pauses at a phrase end (US-026).
**\[Instrumentado 2026-07-11\]** **Screen:** SCR-012

| **Property** | **Type** | **Description**                      |
|:-------------|----------|--------------------------------------|
| phrase_index | number   | Phrase whose end triggered the pause |

## practice_mode_toggled

**Trigger:** User toggles “Modo práctica” (US-027). **\[Instrumentado
2026-07-11\]** **Screen:** SCR-013

| **Property**   | **Type** | **Description**                      |
|:---------------|----------|--------------------------------------|
| new_state      | string   | “on” or “off”                        |
| selected_count | number   | Selected phrases in the practice set |

## practice_mode_completed

**Trigger:** Playback reaches the end of the last selected phrase in
practice mode (US-027). **\[Instrumentado 2026-07-11\]** **Screen:**
SCR-013

| **Property**   | **Type** | **Description**           |
|:---------------|----------|---------------------------|
| selected_count | number   | Phrases played in the run |

## phrase_loop_changed

**Trigger:** User toggles “Loop” (US-028). **\[Corregido 2026-07-11 —
instrumentado; props ajustadas\]** **Screen:** SCR-014

| **Property** | **Type** | **Description** |
|:---|----|----|
| enabled | boolean | Whether looping is active. **Ya no incluye** `loop_count`: el loop es un toggle booleano sin contador configurable (ver enmienda de SCR-014/TC-067). |

## text_visibility_toggled

**Trigger:** User clicks “Ocultar” (US-029). **\[Renombrado y corregido
2026-07-11 — reemplaza** `subtitle_revealed`**\]** **Screen:** SCR-015

| **Property** | **Type** | **Description** |
|:---|----|----|
| hidden | boolean | Whether text is now hidden (true) or visible (false). Reemplaza el modelo anterior de `subtitle_revealed { phrase_index, trigger }`: la feature real es un toggle persistente (`hideTexts`) que afecta subtítulo y lista de frases por igual, no una revelación transitoria por frase con atajo de teclado (ese atajo nunca existió). |

## phrase_timestamps_edited

**Trigger:** saveEdit persists a start/end change (US-030).
**\[Instrumentado 2026-07-11 — solo dispara si start_delta_s o
end_delta_s ≠ 0\]** **Screen:** SCR-016

| **Property**  | **Type** | **Description**     |
|:--------------|----------|---------------------|
| phrase_index  | number   | Edited phrase       |
| start_delta_s | number   | Change in start (s) |
| end_delta_s   | number   | Change in end (s)   |

## phrase_split

**Trigger:** A phrase is split into two (US-031). **\[Instrumentado
2026-07-11\]** **Screen:** SCR-017

| **Property** | **Type** | **Description**           |
|:-------------|----------|---------------------------|
| phrase_index | number   | Index of the split phrase |
| new_total    | number   | Total phrases after split |

## phrase_merged

**Trigger:** A phrase is merged with the next (US-031).
**\[Instrumentado 2026-07-11\]** **Screen:** SCR-017

| **Property** | **Type** | **Description**                  |
|:-------------|----------|----------------------------------|
| phrase_index | number   | Index of the first phrase merged |
| new_total    | number   | Total phrases after merge        |

## phrase_added

**Trigger:** “+ Frase” inserts a new phrase (US-032). **\[Instrumentado
2026-07-11\]** **Screen:** SCR-018

| **Property** | **Type** | **Description**                     |
|:-------------|----------|-------------------------------------|
| at_time_s    | number   | currentTime used for the new phrase |
| new_total    | number   | Total phrases after add             |

## phrase_deleted

**Trigger:** A phrase is deleted after inline confirm (US-032).
**\[Instrumentado 2026-07-11\]** **Screen:** SCR-018

| **Property** | **Type** | **Description**            |
|:-------------|----------|----------------------------|
| phrase_index | number   | Deleted phrase index       |
| new_total    | number   | Total phrases after delete |

## phrases_bulk_selection

**Trigger:** “Todas ✓” or “Ninguna” clicked (US-033). **\[Instrumentado
2026-07-11\]** **Screen:** SCR-019

| **Property** | **Type** | **Description**                |
|:-------------|----------|--------------------------------|
| action       | string   | “select_all” or “deselect_all” |
| total        | number   | Total phrases affected         |

## srt_loaded_in_player

**Trigger:** An SRT is loaded over an already-open video (US-034).
**Screen:** SCR-020

| **Property** | **Type** | **Description**                      |
|:-------------|----------|--------------------------------------|
| file_name    | string   | SRT filename                         |
| phrase_count | number   | Phrases parsed                       |
| replaced     | boolean  | Whether it replaced existing phrases |

## phrase_tick_clicked

**Trigger:** A tick mark on the progress bar is clicked (US-035).
**Screen:** SCR-021

| **Property** | **Type** | **Description**  |
|:-------------|----------|------------------|
| phrase_index | number   | Phrase jumped to |

## upload_size_warning_shown

**Trigger:** Video exceeds size/duration threshold on load (US-036).
**Screen:** SCR-022

| **Property** | **Type** | **Description** |
|:---|----|----|
| file_size_mb | number | Detected size in MB |
| duration_s | number \| null | Detected duration if available (siempre null: solo se valida tamaño, no duración — ver enmienda SCR-022) |
| proceeded | boolean | Whether the user continued anyway |

## stage_window_opened

**Trigger:** “Abrir stage” opens the independent stage window (US-037).
**Screen:** SCR-023, SCR-024

| **Property** | **Type** | **Description**                     |
|:-------------|----------|-------------------------------------|
| method       | string   | “window” or “fullscreen” (fallback) |

## stage_window_closed

**Trigger:** The stage window is closed and playback returns to embedded
mode (US-037 / US-039). **Screen:** SCR-024

| **Property**    | **Type** | **Description**            |
|:----------------|----------|----------------------------|
| open_duration_s | number   | Seconds the stage was open |

------------------------------------------------------------------------

## Eventos de Biblioteca (Bloque 13) — [Instrumentado 2026-09-03]

Estos 6 eventos ya disparan en el código (`app/page.tsx`) pero no estaban
en este documento; son exactamente los que la nota de alcance de más
abajo daba por "documentados por separado" (referencia circular resuelta,
ver corrección 2026-09-03). Cubren US-040..US-046 / SCR-025, SCR-026.

### library_viewed

**Trigger:** `fetchLibrary()` recibe la lista de la biblioteca (entrar a
"📚 Mi biblioteca"). **archivo:línea:** `app/page.tsx:760`. **Screen:**
SCR-026

| **Property** | **Type** | **Description**                    |
|:-------------|----------|------------------------------------|
| video_count  | number   | Cantidad de videos en la biblioteca |

### library_video_opened

**Trigger:** `openFromLibrary()` carga con éxito un video `ready` desde la
biblioteca. **archivo:línea:** `app/page.tsx:793`. **Screen:** SCR-026 →
SCR-005

| **Property** | **Type** | **Description**                 |
|:-------------|----------|---------------------------------|
| video_id     | string   | UUID del video                  |
| phrase_count | number   | Frases cargadas desde la sesión |

### library_video_open_blocked_expired

**Trigger:** intento de abrir un video cuyo `status !== 'ready'` o sin
`storageUrl` (expirado). **archivo:línea:** `app/page.tsx:775`. **Screen:**
SCR-026

| **Property** | **Type** | **Description** |
|:-------------|----------|-----------------|
| video_id     | string   | UUID del video  |

### video_saved_to_library

**Trigger:** `saveToLibrary()` completa el flujo POST → upload Blob →
PATCH → PUT session. **archivo:línea:** `app/page.tsx:840`. **Screen:**
SCR-005

| **Property** | **Type** | **Description**              |
|:-------------|----------|------------------------------|
| video_id     | string   | UUID del video creado        |
| phrase_count | number   | Frases guardadas en la sesión |

### library_save_blocked_quota

**Trigger:** `POST /api/videos` responde 413 (cuota de 8 GB excedida) al
guardar. **archivo:línea:** `app/page.tsx:814`. **Screen:** SCR-005

| **Property**      | **Type** | **Description**                     |
|:------------------|----------|-------------------------------------|
| attempted_size_mb | number   | Tamaño del video que se quiso subir |
| used_bytes_mb     | number   | Bytes ya usados por el usuario (MB) |

### library_video_deleted

**Trigger:** `deleteFromLibrary()` tras `DELETE /api/videos/[id]`.
**archivo:línea:** `app/page.tsx:852`. **Screen:** SCR-026

| **Property** | **Type** | **Description** |
|:-------------|----------|-----------------|
| video_id     | string   | UUID del video  |

------------------------------------------------------------------------

## Eventos de VE Drills (Bloques 14–16) — [Instrumentado 2026-09-03]

12 eventos del motor de ejercicios. Salvo aclaración, disparan desde
`app/ExercisesPanel.tsx`. Cubren US-048..US-055 / SCR-027, SCR-028,
SCR-029, SCR-030.

### exercises_tab_opened

**Trigger:** montaje del panel de ejercicios (useEffect).
**archivo:línea:** `app/ExercisesPanel.tsx:49`. **Screen:** SCR-027

| **Property**    | **Type** | **Description**                |
|:----------------|----------|--------------------------------|
| video_file_name | string   | Video activo (o "" sin video)  |
| selected_count  | number   | Frases seleccionadas al abrir  |

### exercises_source_mode_changed

**Trigger:** cambio de modo de fuente (`handleModeChange`).
**archivo:línea:** `app/ExercisesPanel.tsx:57`. **Screen:** SCR-027

| **Property** | **Type** | **Description**                 |
|:-------------|----------|---------------------------------|
| mode         | string   | "video", "topic" o "both"       |
| has_video    | boolean  | Si hay frases de video cargadas |

### exercises_generation_started

**Trigger:** click "GENERAR EJERCICIOS". **archivo:línea:**
`app/ExercisesPanel.tsx:66`. **Screen:** SCR-027 / SCR-028

| **Property**    | **Type** | **Description**                     |
|:----------------|----------|-------------------------------------|
| mode            | string   | "video" / "topic" / "both"          |
| level           | string   | "beginner" / "intermediate" / "advanced" |
| scope           | string   | "all" / "sel" (según modo)          |
| phrase_count    | number   | Frases enviadas al modelo           |
| video_file_name | string   | Video activo                        |

### exercises_generated

**Trigger:** respuesta OK de `POST /api/exercises`. **archivo:línea:**
`app/ExercisesPanel.tsx:106`. **Screen:** SCR-027 / SCR-028

| **Property** | **Type** | **Description**                 |
|:-------------|----------|---------------------------------|
| quiz_count   | number   | Preguntas de quiz generadas     |
| cloze_count  | number   | Ítems fill-in generados         |
| match_count  | number   | Pares de match generados        |
| duration_ms  | number   | Latencia de la generación       |
| level        | string   | Nivel usado                     |
| mode         | string   | Modo usado                      |

### exercises_generation_failed

**Trigger:** error de `POST /api/exercises`. **archivo:línea:**
`app/ExercisesPanel.tsx:116`. **Screen:** SCR-027 / SCR-028

| **Property** | **Type**       | **Description**       |
|:-------------|----------------|-----------------------|
| http_status  | number \| null | Código HTTP si aplica |
| error        | string         | Mensaje de error      |
| level        | string         | Nivel intentado       |
| mode         | string         | Modo intentado        |

### exercises_pdf_downloaded

**Trigger:** click "DESCARGAR" en el panel de PDF. **archivo:línea:**
`app/ExercisesPanel.tsx:169`. **Screen:** SCR-030

| **Property** | **Type** | **Description**                          |
|:-------------|----------|------------------------------------------|
| version      | string   | "student" / "teacher" / "both"           |
| types        | string   | Tipos incluidos, join con coma           |
| source_mode  | string   | Modo de generación de origen             |

### quiz_answered

**Trigger:** click en una opción de una pregunta de quiz.
**archivo:línea:** `app/ExercisesPanel.tsx:188`. **Screen:** SCR-027

| **Property**   | **Type** | **Description**              |
|:---------------|----------|------------------------------|
| question_index | number   | Índice de la pregunta        |
| selected       | number   | Índice de opción elegida     |
| correct        | boolean  | Si la opción es la correcta  |

### cloze_answered

**Trigger:** submit de un ítem fill-in. **archivo:línea:**
`app/ExercisesPanel.tsx:196`. **Screen:** SCR-027

| **Property** | **Type** | **Description**            |
|:-------------|----------|----------------------------|
| item_index   | number   | Índice del ítem cloze      |
| correct      | boolean  | Si la respuesta es correcta |

### match_pair_attempted

**Trigger:** click en una definición para intentar un match.
**archivo:línea:** `app/ExercisesPanel.tsx:208`. **Screen:** SCR-027

| **Property** | **Type** | **Description**             |
|:-------------|----------|-----------------------------|
| term_index   | number   | Índice del término          |
| def_index    | number   | Índice de la definición     |
| correct      | boolean  | Si el par coincide          |

### match_completed

**Trigger:** se completa el último par del ejercicio de match.
**archivo:línea:** `app/ExercisesPanel.tsx:215`. **Screen:** SCR-027

| **Property** | **Type** | **Description**        |
|:-------------|----------|------------------------|
| total        | number   | Total de pares         |

### exercises_section_opened

**Trigger:** click "Armar ejercicios" en la pantalla de carga (sección
topic-only). **archivo:línea:** `app/page.tsx:1038`. **Screen:** SCR-028

| **Property** | **Type** | **Description**                  |
|:-------------|----------|----------------------------------|
| has_session  | boolean  | Si el usuario está autenticado   |

### exercises_generator_window_opened

**Trigger:** click "⊞ Abrir generador" (ventana autónoma).
**archivo:línea:** `app/page.tsx:575`. **Screen:** SCR-029

| **Property** | **Type** | **Description**                  |
|:-------------|----------|----------------------------------|
| scope        | string   | "all" / "sel"                    |
| phrase_count | number   | Frases enviadas a la ventana     |

------------------------------------------------------------------------

## Nota de alcance (2026-07-11)

Los 13 eventos marcados **\[Instrumentado 2026-07-11\]** o **\[Corregido
2026-07-11\]** estuvieron documentados desde el Bloque D/E pero sin
ningún `capture()` real en el código hasta esta fecha — quedaron sin
conectar durante la implementación original y se detectaron recién al
auditar el código con `grep -n "capture(" app/page.tsx`. Quedan ahora
verificados: nombre de evento, disparador y props confirmados contra el
código real, no contra el plan original.

Existen además 6 eventos de la feature de Biblioteca (`library_viewed`,
`library_video_opened`, `video_saved_to_library`,
`library_video_deleted`, `library_video_open_blocked_expired`,
`library_save_blocked_quota`) que **no están incluidos en este
documento**: pertenecen al Bloque 13 (cuentas de usuario + storage en la
nube), que se documentó por separado en `Core/posthog-events.md.docx` y
todavía no fue reconciliado con este Google Doc — queda pendiente de una
revisión de seguridad y consistencia antes de fusionarlo acá.

**[Corregida 2026-09-03]** La referencia era circular: el "documento
aparte" citado (`Core/posthog-events.md.docx`) es **este mismo archivo**,
y los 6 eventos de biblioteca **no** estaban en él. La auditoría los
verificó en el **código real** (`app/page.tsx:760, 775, 793, 814, 840,
852`) y quedaron reconciliados en la sección "Eventos de Biblioteca
(Bloque 13)" de arriba. Junto con ellos se agregaron los 12 eventos de VE
Drills (Bloques 14–16) que tampoco figuraban. Además, la auditoría
detectó que **24** eventos "core" del player especificados en este
documento nunca se cablearon (ver "Estado de implementación —
2026-09-03"): la reconciliación de 2026-07-11 solo cubrió los 13 eventos
agregados en los Bloques C/D/E, no la tanda base.

# Test Cases — Virtual English Player

## TC-001 — Drop a valid video file (US-001)

**Description:** Verify that dropping a supported video file triggers
the transcription flow. **Preconditions:** App is on the load screen
(SCR-001). No files previously loaded. **Steps:**

1.  Drag an MP4 file onto the dropzone.
2.  Release. **Expected result:** handleFiles is called; step becomes
    ‘uploading’; progress box appears (SCR-003). **Type:** E2E

## TC-002 — Drop an unsupported file type (US-001)

**Description:** Verify that dropping a non-video file shows an error.
**Preconditions:** App is on the load screen (SCR-001). **Steps:**

1.  Drag a .pdf file onto the dropzone.
2.  Release. **Expected result:** Error box appears with text “Arrastrá
    un archivo de video (MP4, AVI, MKV…)”. No progress shown. **Type:**
    E2E

## TC-003 — Select file via file input (US-001)

**Description:** Verify that selecting a file via the hidden `<input>`
triggers the same flow. **Preconditions:** App is on the load screen
(SCR-001). **Steps:**

1.  Click the dropzone area.
2.  Select an .mkv file in the OS dialog. **Expected result:**
    handleFiles is called with the selected file. Transcription flow
    starts. **Type:** E2E

## TC-004 — Transcription upload progress updates (US-002)

**Description:** Verify the upload progress bar advances from 5 % to 35
% as XHR reports progress. **Preconditions:** App is in step =
‘uploading’. XHR mock triggers onprogress events. **Steps:**

1.  Simulate xhr.upload.onprogress with loaded = 50, total = 100.
    **Expected result:** progress state is 5 + 50 \* 0.3 = 20. Step
    label shows “Subiendo al servidor — 50%”. **Type:** Unit

## TC-005 — Transcription step changes to “transcribing” after upload (US-002)

**Description:** Verify the step indicator advances when the upload
completes. **Preconditions:** XHR upload ends (onloadend fires).
**Steps:**

1.  Fire xhr.upload.onloadend. **Expected result:** step becomes
    ‘transcribing’; stepMsg is ‘Gemini transcribiendo el audio…’;
    progress is 40. **Type:** Unit

## TC-006 — Successful transcription response (US-002) — existing test coverage

**Description:** Verify that a valid SRT response from the server
transitions to the player screen. **Preconditions:** POST
/api/transcribe returns { srt: “” }. **Steps:**

1.  Trigger xhr.onload with status 200 and a valid SRT body. **Expected
    result:** parseSRT produces N phrases, screen becomes ‘player’, SRT
    file is downloaded. **Type:** Integration **Note:** Covered by
    tests/api/transcribe.test.ts.

## TC-007 — Server error during transcription (US-002)

**Description:** Verify that a server 500 response shows an error and
resets state. **Preconditions:** POST /api/transcribe returns { error:
“API key not configured” } with status 500. **Steps:**

1.  Trigger xhr.onload with status 500 and error body. **Expected
    result:** errorMsg is set; step resets to ‘idle’; progress resets
    to 0. **Type:** Integration

## TC-008 — Cancel in-progress transcription (US-002)

**Description:** Verify that “Cancelar” aborts the XHR and resets the
UI. **Preconditions:** step is ‘uploading’ or ‘transcribing’. **Steps:**

1.  Click “Cancelar”. **Expected result:** xhrRef.current.abort() is
    called; step = ‘idle’; errorMsg = ‘Cancelado.’; drop zone is shown.
    **Type:** E2E

## TC-009 — Empty SRT after transcription (US-002)

**Description:** Verify that a transcription with zero parseable phrases
shows an error. **Preconditions:** POST /api/transcribe returns { srt:
“” }. **Steps:**

1.  Trigger xhr.onload with empty SRT string. **Expected result:** Error
    message “No se generaron subtítulos…” is shown; screen stays ‘load’.
    **Type:** Integration

## TC-010 — Drop video + SRT together skips transcription (US-003)

**Description:** Verify that providing both files bypasses the
transcription route. **Preconditions:** App on the load screen.
**Steps:**

1.  Drop an MP4 and an SRT file simultaneously. **Expected result:** No
    XHR is made; parseSRT runs in the browser; screen becomes ‘player’;
    srtSource contains “SRT · N frases”. **Type:** E2E

## TC-011 — Invalid SRT alongside video (US-003)

**Description:** Verify that an SRT file with no valid entries shows an
error. **Preconditions:** App on the load screen. **Steps:**

1.  Drop a video and an SRT file whose content has no –\> timestamp
    lines. **Expected result:** errorMsg = ‘El SRT no tiene subtítulos
    válidos.’; screen stays ‘load’. **Type:** E2E

## TC-012 — SRT auto-download after transcription (US-004)

**Description:** Verify a download is triggered after successful Gemini
transcription. **Preconditions:** Transcription succeeds; a spy is
placed on document.createElement(‘a’). **Steps:**

1.  Complete a successful transcription flow. **Expected result:** A
    temporary `<a>` element with a blob URL and a .srt filename is
    programmatically clicked. **Type:** Integration

## TC-013 — Play / pause via button (US-005)

**Description:** Verify the play/pause button toggles video playback.
**Preconditions:** Player screen is shown; video is loaded. **Steps:**

1.  Click the play button.
2.  Click it again. **Expected result:** After step 1: video.play()
    called, isPlaying = true. After step 2: video.pause() called,
    isPlaying = false. **Type:** E2E

## TC-014 — Space key plays/pauses (US-005)

**Description:** Verify Space key toggles playback when no input is
focused. **Preconditions:** Player screen is active; no `<input>` is
focused. **Steps:**

1.  Press Space.
2.  Press Space again. **Expected result:** Video state toggles between
    playing and paused. **Type:** E2E

## TC-015 — Space key is no-op when input is focused (US-005)

**Description:** Verify Space does not toggle playback while typing.
**Preconditions:** An inline edit input is focused. **Steps:**

1.  Press Space. **Expected result:** togglePlay() is not called; video
    state unchanged. **Type:** E2E

## TC-016 — Next phrase navigation (US-006)

**Description:** Verify “Siguiente” / D key advances to the next
subtitle. **Preconditions:** Player screen is loaded with at least 2
phrases; curIdx = 0. **Steps:**

1.  Click “Siguiente” or press D. **Expected result:** video.currentTime
    is set to phrases\[1\].start + 0.05; curIdx becomes 1. **Type:** E2E

## TC-017 — Previous phrase navigation (US-006)

**Description:** Verify “Anterior” / A key goes back. **Preconditions:**
curIdx = 2. **Steps:**

1.  Click “Anterior” or press A. **Expected result:** video.currentTime
    = phrases\[1\].start + 0.05; curIdx = 1. **Type:** E2E

## TC-018 — Navigation clamped at boundaries (US-006)

**Description:** Verify navigation does not go out of bounds.
**Preconditions:** curIdx = 0. **Steps:**

1.  Press A. **Expected result:** curIdx remains 0; no error thrown.
    **Type:** Unit

## TC-019 — Phrase list auto-scrolls to active item (US-006)

**Description:** Verify the phrase list scrolls the active item into
view. **Preconditions:** The list has 20+ phrases; the active one is
off-screen. **Steps:**

1.  Navigate to a phrase that is not visible. **Expected result:**
    scrollIntoView({ block: ‘nearest’, behavior: ‘smooth’ }) is called
    on the active \[data-act=“true”\] element. **Type:** E2E

## TC-020 — Repeat phrase (US-007)

**Description:** Verify the “Repetir” button / R key jumps back to
phrase start. **Preconditions:** curIdx = 3; video is playing.
**Steps:**

1.  Press R. **Expected result:** video.currentTime =
    phrases\[3\].start + 0.05; playback continues. **Type:** E2E

## TC-021 — Micro-repeat jumps back 2 s (US-008)

**Description:** Verify micro-repeat moves currentTime back exactly 2 s,
clamped to phrase start. **Preconditions:** curIdx = 2;
phrases\[2\].start = 10; video.currentTime = 13. **Steps:**

1.  Press W. **Expected result:** video.currentTime = max(10, 13 - 2)
    = 11. **Type:** Unit

## TC-022 — Micro-repeat clamps to phrase start (US-008)

**Description:** Verify micro-repeat does not seek before the phrase
start. **Preconditions:** curIdx = 1; phrases\[1\].start = 5;
video.currentTime = 5.5. **Steps:**

1.  Press W. **Expected result:** video.currentTime = max(5, 5.5 - 2)
    = 5. **Type:** Unit

## TC-023 — Subtitle appears on phrase start (US-009)

**Description:** Verify subtitle text appears when currentTime enters a
phrase window. **Preconditions:** Phrases loaded; ccOn = true.
**Steps:**

1.  Set video.currentTime to phrases\[0\].start + 0.1.
2.  Fire timeupdate. **Expected result:** subText = phrases\[0\].text;
    subVisible = true. **Type:** Integration

## TC-024 — Subtitle disappears outside phrase window (US-009)

**Description:** Verify the subtitle overlay hides when no phrase is
active. **Preconditions:** subVisible = true; currentTime moves past
phrases\[0\].end. **Steps:**

1.  Set currentTime beyond the phrase window.
2.  Fire timeupdate. **Expected result:** subVisible = false; subText =
    ’’. **Type:** Integration

## TC-025 — Content words are highlighted in subtitle (US-009)

**Description:** ~~Verify hl() wraps content words in amber.~~ **[Corregida
2026-09-03]** El resaltado ámbar se eliminó (US-014): `hl()` ya no aplica
color; los subtítulos se renderizan en blanco. **Preconditions:** N/A (unit
test on lib/hl.tsx). **Steps:**

1.  Call hl(“the quick brown fox”). **Expected result:** devuelve el texto
    plano como `ReactNode[]` **sin ningún** `<span style="color:…">`; el
    `textContent` es idéntico al input. **Type:** Unit **Note:** Covered by
    tests/lib/hl.test.tsx (tests de "comportamiento base" enmendados).

## TC-026 — Toggle subtitles off (US-010)

**Description:** Verify the CC toggle hides subtitles when OFF.
**Preconditions:** ccOn = true; a subtitle is currently visible.
**Steps:**

1.  Click the “Subtítulos” button. **Expected result:** ccOn = false;
    the subtitle overlay is not rendered; badge shows “OFF”. **Type:**
    E2E

## TC-027 — Toggle subtitles back on (US-010)

**Description:** Verify turning CC back on restores subtitle sync.
**Preconditions:** ccOn = false. **Steps:**

1.  Click the “Subtítulos” button. **Expected result:** ccOn = true;
    badge shows “ON”. **Type:** E2E

## TC-028 — Change playback speed (US-011)

**Description:** Verify clicking a speed button updates
video.playbackRate. **Preconditions:** Player screen; video loaded;
speedIdx = 2 (1.0×). **Steps:**

1.  Click the “0.75×” button. **Expected result:** video.playbackRate =
    0.75; the “0.75×” button is visually active. **Type:** E2E

## TC-029 — Increase subtitle delay (US-012)

**Description:** Verify “+” button increases delay by 0.5 s.
**Preconditions:** delay = 0. **Steps:**

1.  Click “+”. **Expected result:** delay = 0.5; display shows “+0.5 s”
    in blue. **Type:** E2E

## TC-030 — Decrease subtitle delay (US-012)

**Description:** Verify “−” button decreases delay by 0.5 s.
**Preconditions:** delay = 0. **Steps:**

1.  Click “−”. **Expected result:** delay = -0.5; display shows “−0.5 s”
    in red. **Type:** E2E

## TC-031 — Reset subtitle delay (US-012)

**Description:** Verify “reset” link returns delay to 0.
**Preconditions:** delay = 1.5. **Steps:**

1.  Click “reset”. **Expected result:** delay = 0; display shows “0.0 s”
    in amber. **Type:** E2E

## TC-032 — Subtitle timing shifted by delay (US-012)

**Description:** Verify that the delay offset is applied when matching
currentTime to phrases. **Preconditions:** phrases\[0\] = { start: 5,
end: 8 }; delay = -1. **Steps:**

1.  Set currentTime = 6.
2.  Fire timeupdate. (Effective time = 6 − (−1) = 7; within phrase
    window.) **Expected result:** subText = phrases\[0\].text. **Type:**
    Unit

## TC-033 — Volume slider changes video volume (US-013)

**Description:** Verify the volume range input updates video.volume.
**Preconditions:** Player screen; vol = 100. **Steps:**

1.  Set slider to 50. **Expected result:** video.volume = 0.5; vol = 50;
    display shows “50%”. **Type:** E2E

## TC-034 — Arrow up/down adjusts volume (US-013)

**Description:** Verify ↑/↓ keys change volume by 10 %.
**Preconditions:** video.volume = 0.5; no input focused. **Steps:**

1.  Press ↑. **Expected result:** video.volume = 0.6. **Type:** E2E

## TC-035 — Click progress bar seeks to position (US-014)

**Description:** Verify clicking on the progress track seeks video
proportionally. **Preconditions:** video.duration = 100; track width =
200 px. **Steps:**

1.  Click at 100 px from left of the track. **Expected result:**
    video.currentTime = 50 (50 % of 100 s). **Type:** E2E

## TC-036 — Skip forward 10 seconds (US-015)

**Description:** Verify skip-forward button adds 10 s.
**Preconditions:** video.currentTime = 30; video.duration = 100.
**Steps:**

1.  Click the skip-forward button. **Expected result:**
    video.currentTime = 40. **Type:** E2E

## TC-037 — Skip backward clamps to 0 (US-015)

**Description:** Verify skip-back clamps at 0 when near the start.
**Preconditions:** video.currentTime = 5. **Steps:**

1.  Click skip-back. **Expected result:** video.currentTime = 0.
    **Type:** E2E

## TC-038 — Toggle phrase selection (US-016)

**Description:** Verify clicking the checkbox toggles sel on a phrase.
**Preconditions:** phrases\[0\].sel = true. **Steps:**

1.  Click the checkbox of phrase 0. **Expected result:**
    phrases\[0\].sel = false; count decrements. **Type:** E2E

## TC-039 — Selected phrase counter updates (US-016)

**Description:** Verify the selection count in the panel meta and list
header reflects the current selection. **Preconditions:** 3 of 10
phrases selected. **Steps:**

1.  Select one more phrase. **Expected result:** Counter shows “4 sel.”.
    **Type:** E2E

## TC-040 — Filter list to selected phrases (US-017)

**Description:** Verify switching to “Sel.” filter hides unselected
phrases. **Preconditions:** 10 phrases; 3 are selected. **Steps:**

1.  Click “Sel.” filter button. **Expected result:** List shows only 3
    rows; “Sel.” button is visually active. **Type:** E2E

## TC-041 — Click filtered phrase navigates correctly (US-017)

**Description:** Verify that clicking a phrase in the filtered list
seeks to the correct time. **Preconditions:** Filter = “Sel.”; the
second displayed phrase is original index 5. **Steps:**

1.  Click the second visible phrase row. **Expected result:**
    video.currentTime = phrases\[5\].start + 0.05. **Type:** E2E

## TC-042 — Edit phrase text (US-018)

**Description:** Verify that editing a phrase inline updates the phrase
array. **Preconditions:** Player screen; phrases loaded. **Steps:**

1.  Click the edit pencil on phrase 0.
2.  Clear the input, type “New text”.
3.  Click ✓. **Expected result:** phrases\[0\].text = “New text”; edit
    input is closed. **Type:** E2E

## TC-043 — Cancel phrase edit (US-018)

**Description:** Verify that canceling an edit leaves the phrase
unchanged. **Preconditions:** Edit mode is active on phrase 1 with text
“Hello world”. **Steps:**

1.  Change the input text to “wrong”.
2.  Press Escape. **Expected result:** phrases\[1\].text = “Hello
    world”; edit input is closed. **Type:** E2E

## TC-044 — Keyboard shortcuts disabled during edit (US-018)

**Description:** Verify that Space/ArrowLeft etc. do not trigger player
actions while an edit input is focused. **Preconditions:** Edit input
for phrase 2 is focused and active. **Steps:**

1.  Press Space. **Expected result:** togglePlay() is not called; video
    state unchanged. **Type:** E2E

## TC-045 — Download SRT from player (US-019)

**Description:** Verify the “↓ SRT” button triggers a blob download.
**Preconditions:** Phrases are loaded in the player; videoFileName =
“lesson.mp4”. **Steps:**

1.  Click “↓ SRT”. **Expected result:** A blob URL for the SRT content
    is created; a temporary is clicked. **Type:** E2E

## TC-046 — SRT download format is valid (US-019)

**Description:** Verify the downloaded SRT conforms to standard SRT
block format. **Preconditions:** phrases = \[{ start: 0, end: 4.5, text:
“Hello”, sel: true }\]. **Steps:**

1.  Execute downloadSRT() and capture the blob content. **Expected
    result:** Blob contains “1:00:00,000 –\> 00:00:04,500”. **Type:**
    Unit

## TC-047 — Return to load screen (US-020)

**Description:** Verify “← Cargar otro” resets all player state.
**Preconditions:** Player screen is active; phrases loaded; video
playing. **Steps:**

1.  Click “← Cargar otro”. **Expected result:** screen = ‘load’; phrases
    = \[\]; curIdx = -1; isPlaying = false; videoUrl = ’‘; step =
    ’idle’. **Type:** E2E

## TC-048 — parseSRT strips Gemini code fences (US-002 / US-003)

**Description:** Verify parseSRT removes leading/trailing \`\`\` fences
from Gemini output. **Preconditions:** N/A. **Steps:**

1.  Call parseSRT(“`srt\n1\n00:00:01,000 --> 00:00:03,000\nHello\n`”).
    **Expected result:** Returns one phrase with text = “Hello”.
    **Type:** Unit **Note:** Covered by tests/lib/srt.test.ts.

## TC-049 — parseSRT accepts MM:SS timestamps (US-002 / US-003)

**Description:** Verify the parser handles the short MM:SS timestamp
format. **Preconditions:** N/A. **Steps:**

1.  Call parseSRT(“1:05 –\> 01:10”). **Expected result:** Returns {
    start: 65, end: 70, text: “Short” }. **Type:** Unit **Note:**
    Covered by tests/lib/srt.test.ts.

## TC-050 — /api/transcribe returns 400 when no file (US-002)

**Description:** Verify the transcribe endpoint rejects requests without
a file. **Preconditions:** GEMINI_API_KEY is set. **Steps:**

1.  POST /api/transcribe with empty FormData. **Expected result:** {
    error: “No file provided” } with HTTP 400. **Type:** Integration
    **Note:** Covered by tests/api/transcribe.test.ts.

## TC-051 — /api/upload-init returns upload URL (US-002 / large file path)

**Description:** Verify the upload-init endpoint returns a Gemini upload
URL. **Preconditions:** GEMINI_API_KEY is set; Gemini mock returns a
valid x-goog-upload-url header. **Steps:**

1.  POST /api/upload-init with { mimeType: “video/mp4”, size: 10000 }.
    **Expected result:** { uploadUrl: “https://…” } with HTTP 200.
    **Type:** Integration **Note:** Covered by
    tests/api/upload-init.test.ts. NOTA (2026-07-11): este endpoint
    quedó como “escape hatch” sin usar en el flujo actual del cliente
    tras el revert de CORS (ver enmienda US-003 más abajo); el test
    sigue vigente porque la ruta sigue existiendo y funcionando, solo
    que app/page.tsx ya no la invoca.

## TC-052 — /api/upload-init returns 400 for invalid size (US-002)

**Description:** Verify validation rejects zero or negative size.
**Preconditions:** N/A. **Steps:**

1.  POST /api/upload-init with { mimeType: “video/mp4”, size: -1 }.
    **Expected result:** { error: “size must be a positive number” }
    with HTTP 400. **Type:** Integration **Note:** Covered by
    tests/api/upload-init.test.ts.

## TC-053 — XSS safety in subtitle rendering (US-009)

**Description:** Verify that malicious text in an SRT file is not
injected as raw HTML. **Preconditions:** N/A. **Steps:**

1.  Call hl(‘’). **Expected result:** The angle brackets are rendered as
    escaped text nodes; no element exists in the DOM. **Type:** Unit
    **Note:** Covered by tests/lib/hl.test.tsx.

## TC-054 — Session autosaved on state change (US-023)

**Description:** Verify that editing a phrase, changing delay or speed
serializes session state to localStorage (debounced). **Preconditions:**
Player loaded; videoFileName = “lesson.mp4”, fileSize known. **Steps:**

1.  Edit phrase 0 text and wait ~500 ms. **Expected result:**
    localStorage key ve-session:lesson.mp4:{fileSize} contains phrases,
    delay, speedIdx, ccOn, filter. **Type:** Integration

## TC-055 — Autosave is best-effort on storage failure (US-023)

**Description:** Verify the player does not crash when localStorage
throws (quota / private mode). **Preconditions:** localStorage.setItem
mocked to throw. **Steps:**

1.  Trigger a state change that would autosave. **Expected result:**
    Error is swallowed; no exception bubbles; player keeps working.
    **Type:** Unit

## TC-056 — Restore prompt shown for matching video (US-024)

**Description:** Verify the restore notice appears when a saved session
exists for the loaded video. **Preconditions:** A saved session exists;
the same video is loaded (SCR-010). **Steps:**

1.  Load the matching video with an SRT/transcription of the same phrase
    count. **Expected result:** Notice “Hay una sesión guardada para
    este video — ¿Restaurar?” with “Restaurar” / “Descartar”. **Type:**
    E2E

## TC-057 — Restore applies saved state (US-024)

**Description:** Verify confirming restore replaces phrases, delay,
speedIdx, ccOn, filter. **Preconditions:** SCR-010 notice visible.
**Steps:**

1.  Click “Restaurar”. **Expected result:** State is replaced with saved
    values; player reflects saved edits/selection. **Type:** E2E

## TC-058 — Restore skipped on phrase-count mismatch (US-024)

**Description:** Verify a saved session is ignored when its phrase count
differs from the current SRT. **Preconditions:** Saved session has 40
phrases; current SRT has 38. **Steps:**

1.  Load the video. **Expected result:** No restore prompt; current
    transcription/SRT is used. **Type:** Unit

## TC-059 — Exit confirmation shown when dirty (US-025)

**Description:** Verify the confirmation dialog appears on “← Cargar
otro” with unsaved changes. **Preconditions:** dirty = true (at least
one edit/selection/delay change) (SCR-011). **Steps:**

1.  Click “← Cargar otro”. **Expected result:** Dialog with “Descargar
    SRT y salir” / “Salir sin guardar” / “Cancelar”. **Type:** E2E

## TC-060 — No exit confirmation when clean (US-025)

**Description:** Verify exit is immediate when there are no unsaved
changes. **Preconditions:** dirty = false. **Steps:**

1.  Click “← Cargar otro”. **Expected result:** screen = ‘load’
    directly; no dialog. **Type:** E2E

## TC-061 — Auto-pause at phrase end when ON (US-026)

**Description:** Verify the video pauses at phrases\[curIdx\].end when
Auto-pausa is ON. **Preconditions:** autoPause = true; curIdx = 0;
playing (SCR-012). **Steps:**

1.  Advance currentTime past phrases\[0\].end and fire the
    RAF/timeupdate check. **Expected result:** video.pause() called
    once; isPlaying = false. **Type:** Integration

## TC-062 — No auto-pause when OFF (US-026)

**Description:** Verify playback continues across phrase end when
Auto-pausa is OFF. **Preconditions:** autoPause = false. **Steps:**

1.  Advance past phrases\[0\].end. **Expected result:** video keeps
    playing; isPlaying = true. **Type:** Integration

## TC-063 — Auto-pause fires once per phrase (US-026)

**Description:** Verify the pausedAt flag prevents re-pausing on the
same boundary. **Preconditions:** autoPause = true; just paused at
phrases\[0\].end. **Steps:**

1.  Fire additional RAF frames at the same time without changing phrase.
    **Expected result:** pause() is not called again until phrase
    changes or manual play. **Type:** Unit

## TC-064 — Practice mode plays only selected in sequence (US-027)

**Description:** Verify playback jumps to the next selected phrase
instead of continuing linearly. **Preconditions:** practiceMode = true;
phrases 1 and 4 selected (SCR-013). **Steps:**

1.  Reach end of phrase 1. **Expected result:** currentTime =
    phrases\[4\].start + 0.05. **Type:** Integration

## TC-065 — Practice mode pauses after last selected (US-027)

**Description:** Verify the video pauses after the final selected
phrase. **Preconditions:** practiceMode = true; last selected is phrase
4. **Steps:**

1.  Reach end of phrase 4. **Expected result:** video.pause(); isPlaying
    = false. **Type:** Integration

## TC-066 — Practice mode disabled with no selection (US-027)

**Description:** Verify the “Modo práctica” button is disabled when
nothing is selected. **Preconditions:** 0 phrases selected. **Steps:**

1.  Inspect the button. **Expected result:** Button is disabled /
    non-interactive. **Type:** E2E

## TC-067 — Loop repeats the phrase indefinitely while ON (US-028) — \[CORREGIDA 2026-07-11\]

**Description:** Verify the phrase loops indefinitely (not a fixed
count) while Loop is ON. La implementación descartó el contador
configurable 1–5 originalmente previsto: es un toggle booleano.
**Preconditions:** loopMode = true; curIdx = 2. **Steps:**

1.  Let the phrase reach its end multiple times in a row. **Expected
    result:** currentTime returns to phrases\[2\].start + 0.05 every
    time the phrase ends, indefinitely, for as long as loopMode stays
    ON. No configurable repetition count exists anywhere in the UI or
    state. **Type:** Integration

## TC-068 — Loop guard prevents duplicate seeks within the same phrase (US-028) — \[CORREGIDA 2026-07-11\]

**Description:** Verify the loopedAt guard prevents firing more than one
seek per end-of-phrase crossing. **Preconditions:** loopMode = true;
just looped back to the start of phrase 2. **Steps:**

1.  Fire additional timeupdate events at/near the same boundary before
    currentTime is visibly back inside the phrase range. **Expected
    result:** Only one seek fires per boundary crossing; the guard
    (loopedAt) resets once currentTime falls back inside \[phrase.start,
    phrase.end\]. **Type:** Unit

## TC-069 — “Ocultar” hides text independent of CC (US-029) — \[CORREGIDA 2026-07-11, reemplaza “Reveal shows current phrase when CC off”\]

**Description:** Verify clicking “Ocultar” (renombrado desde “Revelar”
en el fix P2) hides both the subtitle overlay and the phrase-list text,
regardless of the ccOn state. No keyboard shortcut exists (the “C” key
was never implemented). **Preconditions:** A phrase is active; hideTexts
= false. **Steps:**

1.  Click “Ocultar”. **Expected result:** The subtitle overlay
    disappears and the phrase-list text is replaced with
    blank/placeholder, independent of ccOn’s value. **Type:** E2E

## TC-070 — “Ocultar” state persists across phrase changes (US-029) — \[CORREGIDA 2026-07-11, reemplaza “Reveal hides on phrase change”\]

**Description:** Verify hideTexts does NOT reset when the active phrase
changes — unlike the original “reveal on demand, hide again on next
phrase” spec, this is a persistent toggle. **Preconditions:** hideTexts
= true. **Steps:**

1.  Navigate to another phrase (Anterior/Siguiente or click a row).
    **Expected result:** Text remains hidden; hideTexts is completely
    unaffected by phrase navigation. **Type:** Integration

## TC-071 — Edit phrase timestamps (US-030)

**Description:** Verify editing start/end updates the phrase and its
tick position. **Preconditions:** Edit mode on phrase 0 (SCR-016).
**Steps:**

1.  Set start = 00:05,000 and end = 00:08,000 and save. **Expected
    result:** phrases\[0\].start = 5, end = 8; tick repositions on the
    progress bar. **Type:** E2E

## TC-072 — Reject invalid timestamps (US-030)

**Description:** Verify start ≥ end or bad format is rejected.
**Preconditions:** Edit mode on a phrase. **Steps:**

1.  Set start = 00:10,000, end = 00:08,000 and try to save. **Expected
    result:** Inline error shown; phrase unchanged. **Type:** Unit

## TC-073 — Split phrase automatically at midpoint, not cursor (US-031) — \[CORREGIDA 2026-07-11\]

**Description:** Verify “Dividir” splits at the automatic text midpoint
(Math.floor(text.length/2)) — there is no cursor-position input; the
original “place cursor, click Dividir” spec was descoped during
implementation. **Preconditions:** phrase 0 = { start: 0, end: 10, text:
“AAAAA BBBBB” } (11 chars total; midpoint index = 5). **Steps:**

1.  Click “Dividir” (no cursor positioning available or required).
    **Expected result:** Two phrases split at char index 5: “AAAAA” and
    “BBBBB” (leading space trimmed via trimStart); time range split
    proportionally by character count of each half (≈\[0, 4.55\],
    ≈\[4.55, 10\] for this example). **Type:** Unit

## TC-074 — Merge with next phrase (US-031)

**Description:** Verify merging concatenates text and spans both time
ranges. **Preconditions:** phrase 0 = \[0,4\] “Hello”; phrase 1 =
\[4,8\] “world”. **Steps:**

1.  Click “Unir con siguiente” on phrase 0. **Expected result:** Single
    phrase \[0,8\] “Hello world”; sel = true if either was selected.
    **Type:** Unit

## TC-075 — Add empty phrase at currentTime (US-032)

**Description:** Verify “+ Frase” inserts an editable empty phrase near
currentTime. **Preconditions:** currentTime = 12; player loaded
(SCR-018). **Steps:**

1.  Click “+ Frase”. **Expected result:** New phrase inserted with
    default start/end based on 12; opens in edit mode; list re-sorted by
    start. **Type:** E2E

## TC-076 — Delete phrase with inline confirm (US-032)

**Description:** Verify deleting a phrase requires a brief confirm and
updates indices. **Preconditions:** 3 phrases; curIdx = 1. **Steps:**

1.  Click the trash icon on phrase 1 and confirm. **Expected result:**
    phrase removed; curIdx moves to nearest previous; list re-indexed.
    **Type:** E2E

## TC-077 — Select all phrases (US-033)

**Description:** Verify “Todas ✓” sets sel = true on every phrase.
**Preconditions:** Some phrases unselected (SCR-019). **Steps:**

1.  Click “Todas ✓”. **Expected result:** All phrases sel = true;
    counter shows total; all ticks amber. **Type:** E2E

## TC-078 — Deselect all phrases (US-033)

**Description:** Verify “Ninguna” sets sel = false on every phrase.
**Preconditions:** Some phrases selected; filter = ‘all’. **Steps:**

1.  Click “Ninguna”. **Expected result:** All sel = false; counter shows
    “0 sel.”; if filter were ‘sel’, list shows “Sin frases”. **Type:**
    E2E

## TC-079 — Load SRT over open video (US-034)

**Description:** Verify loading an SRT in the player replaces phrases
without leaving the screen. **Preconditions:** Player active; valid .srt
selected (SCR-020). **Steps:**

1.  Click “Cargar SRT” and pick a valid file. **Expected result:**
    phrases replaced via parseSRT; playback not interrupted. If dirty,
    the US-025 exit dialog (reused via exitPendingRef) appears first;
    confirming applies the new SRT. **Type:** E2E

## TC-080 — Invalid SRT in player keeps state (US-034)

**Description:** Verify an SRT with 0 valid entries shows an error and
changes nothing. **Preconditions:** Player active. **Steps:**

1.  Load an SRT with no “–\>” lines. **Expected result:** “El archivo no
    contiene frases válidas” (or equivalent inline error); current
    phrases unchanged. **Type:** E2E

## TC-081 — Click tick jumps to phrase (US-035)

**Description:** Verify clicking a tick mark calls jumpTo for that
phrase instead of scrub. **Preconditions:** Progress bar with tick marks
(SCR-021). **Steps:**

1.  Click on the tick of phrase 5. **Expected result:** curIdx = 5;
    currentTime = phrases\[5\].start + 0.05; list scrolls to it.
    **Type:** E2E

## TC-082 — Click outside tick still scrubs (US-035)

**Description:** Verify clicking the track away from any tick still
seeks proportionally. **Preconditions:** duration = 100; track width =
200 px. **Steps:**

1.  Click at 100 px on an area with no tick. **Expected result:**
    currentTime = 50 (scrub behavior preserved). **Type:** E2E

## TC-083 — Size warning over 200MB threshold, size only (US-036) — \[CORREGIDA 2026-07-11\]

**Description:** Verify a non-blocking warning appears when file.size
exceeds the 200MB threshold. Duration is never checked — the
metadata-duration path described in the original spec was never
implemented. **Preconditions:** Video file \> 200MB. **Steps:**

1.  Select the oversized video. **Expected result:** Banner shows the
    file name and detected size in MB, with two actions: “Continuar de
    todos modos” / “Cancelar”. No duration figure is ever shown.
    **Type:** E2E

## TC-084 — “Cancelar” fully resets to a clean dropzone; no direct “use own SRT” path (US-036) — \[CORREGIDA 2026-07-11\]

**Description:** Verify “Continuar de todos modos” starts transcription
normally, and “Cancelar” fully resets state (video, sizeWarn, blob URL)
back to an empty dropzone. There is no dedicated “usar SRT propio”
button — the teacher can still combine video+SRT via the existing
dropzone (US-002) after cancelling. **Preconditions:** Warning visible.
**Steps:**

1.  Click “Continuar de todos modos”. **Expected result:** Transcription
    flow starts normally (step = ‘uploading’).
2.  (Separate run) Click “Cancelar”. **Expected result:** Banner
    disappears; videoFileName/videoUrl/videoFileRef all cleared;
    dropzone is fully usable again for a fresh drop (including video+SRT
    combined). **Type:** E2E

## TC-085 — Open stage window with only video + subs (US-037)

**Description:** Verify “Abrir stage” opens a separate window containing
only the video and subtitle overlay. **Preconditions:** Player active;
popups allowed (SCR-023). **Steps:**

1.  Click “Abrir stage”. **Expected result:** New window shows video +
    subtitle overlay; no controls/panel/Zoom hint present. **Type:** E2E

## TC-086 — Fullscreen fallback when popup blocked (US-037)

**Description:** Verify a blocked popup falls back to fullscreen of the
stage. **Preconditions:** window.open returns null (blocked). **Steps:**

1.  Click “Abrir stage”. **Expected result:** Fullscreen API is used on
    the stage element as fallback. **Type:** E2E

## TC-087 — Panel actions propagate to stage (US-038)

**Description:** Verify play/pause, navigation, speed, delay, CC
commands reach the stage window. **Preconditions:** Stage window open
(SCR-024). **Steps:**

1.  Click play, then “Siguiente”, then change speed from the panel.
    **Expected result:** Stage video reflects each action in real time
    via the panel↔stage channel. **Type:** Integration

## TC-088 — Single audio source, no double playback (US-038)

**Description:** Verify only the stage video plays (no duplicate audio
from the panel). **Preconditions:** Stage window open and playing.
**Steps:**

1.  Listen/inspect both contexts. **Expected result:** Only one is
    playing; no double audio or desync. **Type:** Integration

## TC-089 — Stage opens at current time/state (US-039)

**Description:** Verify opening the stage mid-playback resumes from
current time and play state. **Preconditions:** Video playing at
currentTime = 42. **Steps:**

1.  Click “Abrir stage”. **Expected result:** Stage starts at ~42 s with
    the same play/pause state. **Type:** Integration

## TC-090 — Closing stage preserves session (US-039)

**Description:** Verify closing the stage returns to embedded mode
without losing state. **Preconditions:** Stage open;
phrases/selection/delay/speed set. **Steps:**

1.  Close the stage window. **Expected result:** Embedded video resumes
    at currentTime; phrases, selection, delay, speed intact;
    transcription not re-run. **Type:** Integration

## TC-091 — Delay clamped to ±10 s (US-016 amendment)

**Description:** Verify adjDelay cannot exceed the ±10 s range.
**Preconditions:** delay = 10. **Steps:**

1.  Click “+” once more. **Expected result:** delay stays at 10
    (clamped); symmetric at −10. **Type:** Unit

## Enmienda — TC-051 y flujo de transcripción (post CORS revert, 2026-07-11)

El flujo de subida volvió a ser server-side (multipart FormData a
/api/transcribe, upload y polling a Gemini hechos por el servidor)
porque el flujo de 3 requests con PUT directo del browser a Gemini quedó
bloqueado por CORS en producción (generativelanguage.googleapis.com no
envía Access-Control-Allow-Origin). TC-004 a TC-009 ya describían este
comportamiento server-side correctamente y no requieren cambios.
TC-051/052 (/api/upload-init) siguen vigentes como tests de una ruta que
existe en el código pero que el cliente no invoca actualmente — queda
como “escape hatch” documentado para si Gemini resuelve el CORS en el
futuro.

------------------------------------------------------------------------

## Enmienda — casos nuevos (auditoría 2026-09-03)

Se agregan los casos que cubren Biblioteca (Bloque 13), VE Drills y el
gate de login. **Numeración:** para no romper la trazabilidad, los TC
que los tests ya citan conservan su ID (TC-110–117 del Bloque 15,
TC-134–140 del Bloque 16). Los rangos **TC-118–133** quedan reservados
sin asignar. La biblioteca y el Bloque 14 usan TC-092–109.

**Colisión TC-089 / TC-090:** el doc asigna TC-089 = "Stage opens at
current time/state (US-039)" y TC-090 = "Closing stage preserves session
(US-039)". Pero `tests/app/load-nav.test.tsx` cita TC-089 (navegación /
biblioteca), `tests/app/login-gate.test.tsx` cita TC-090 (gate) y
`tests/app/stage-edit.test.tsx` también cita TC-089. No se renumeran los
IDs del doc; los casos canónicos de biblioteca/gate se documentan abajo
(TC-092/094 y TC-102) y esos tests deberían migrar a los IDs nuevos.

## TC-092 — Login con Google entra a la app (US-040 / US-047)

**Description:** Autenticarse con Google habilita la pantalla de carga.
**Preconditions:** `authStatus === 'unauthenticated'`; se ve SCR-025.
**Steps:**

1.  Click "Iniciar sesión con Google" → `signIn('google')`.
2.  Volver autenticado. **Expected result:** `authStatus ===
    'authenticated'`; se renderiza el dropzone y el topbar (biblioteca /
    salir). **Type:** E2E *(colisión: `login-gate.test.tsx` cita TC-090)*

## TC-093 — Logout invalida la sesión (US-040)

**Description:** "Salir" cierra la sesión de servidor.
**Preconditions:** autenticado en SCR-load. **Steps:**

1.  Click "Salir" → `signOut()`. **Expected result:** vuelve a SCR-025;
    no hay acceso al dropzone. **Type:** E2E

## TC-094 — Listar biblioteca del usuario, orden descendente (US-041)

**Description:** GET /api/videos devuelve solo los videos del usuario,
más reciente primero, con phraseCount. **Preconditions:** usuario con ≥2
videos guardados. **Steps:**

1.  Entrar a "📚 Mi biblioteca" → `fetchLibrary()`. **Expected result:**
    filas ordenadas por `created_at` desc; cada una con nombre y cantidad
    de frases; dispara `library_viewed`. **Type:** Integration
    *(`tests/api/videos.test.ts`; colisión: `load-nav.test.tsx` cita
    TC-089)*

## TC-095 — Guardar video: flujo POST → Blob → PATCH → PUT (US-042)

**Description:** `saveToLibrary()` crea metadata, sube a Blob, confirma
storageUrl y persiste la sesión. **Preconditions:** autenticado, video
en memoria, ≥1 frase. **Steps:**

1.  Click "📚 Guardar en biblioteca". **Expected result:** POST
    /api/videos → upload() → PATCH storageUrl (status 'ready') → PUT
    session; dispara `video_saved_to_library`; el botón desaparece.
    **Type:** Integration *(`tests/api/videos.test.ts`,
    `videos-detail.test.ts`, `videos-session.test.ts`,
    `blob-upload.test.ts`)*

## TC-096 — Guardar bloqueado por cuota (US-042 / US-046)

**Description:** Si POST /api/videos responde 413, no se sube el archivo.
**Preconditions:** cuota casi llena. **Steps:**

1.  Guardar un video que excede QUOTA_BYTES. **Expected result:** error
    "límite de espacio"; dispara `library_save_blocked_quota`; no hay
    upload a Blob. **Type:** Integration

## TC-097 — Reabrir video ready vs. expirado (US-043 / US-046)

**Description:** Un video 'ready' carga la sesión; uno expirado se
bloquea. **Preconditions:** biblioteca con un video 'ready' y uno
'expired'. **Steps:**

1.  "Abrir" el 'ready' → carga player con frases/delay/speed/cc/filter;
    dispara `library_video_opened`.
2.  "Abrir" el 'expired' (o status ≠ 'ready' / sin storageUrl) →
    bloqueado con mensaje; dispara `library_video_open_blocked_expired`.
    **Expected result:** ambos comportamientos. **Type:** Integration
    *(`tests/api/videos-detail.test.ts`)*

## TC-098 — Autoguardado a DB cuando el video viene de biblioteca (US-044)

**Description:** Con `libraryVideoIdRef` seteado, el autosave va a PUT
/api/videos/[id]/session en vez de localStorage. **Preconditions:**
video abierto desde biblioteca. **Steps:**

1.  Editar una frase y esperar ~500 ms. **Expected result:** PUT a la DB
    (upsert); no se escribe localStorage. **Type:** Integration
    *(`tests/api/videos-session.test.ts`)*

## TC-099 — Eliminar video borra fila y blob (US-045)

**Description:** DELETE /api/videos/[id] borra la fila (cascada sobre
video_sessions) y el blob best-effort. **Preconditions:** video propio en
la biblioteca. **Steps:**

1.  Click "Eliminar". **Expected result:** la fila desaparece; dispara
    `library_video_deleted`; DELETE del blob es best-effort. **Type:**
    Integration *(`tests/api/videos-detail.test.ts`)*

## TC-100 — Cuota validada en el servidor (US-046)

**Description:** `getUsedBytes` suma solo videos 'ready' y compara contra
QUOTA_BYTES (8 GB) en POST /api/videos y en blob-upload.
**Preconditions:** n/a. **Steps:**

1.  Superar la cuota vía POST y vía token de blob. **Expected result:**
    413 en ambos; nunca solo cliente. **Type:** Unit/Integration
    *(`tests/lib/library.test.ts`, `videos.test.ts`, `blob-upload.test.ts`)*

## TC-101 — Ownership: no operar sobre video ajeno (US-045 / US-046)

**Description:** `getOwnedVideo` impide abrir/borrar/editar videos de
otro usuario. **Preconditions:** dos usuarios. **Steps:**

1.  Usuario A intenta GET/DELETE/PUT sobre un video de B. **Expected
    result:** 404 "Video no encontrado". **Type:** Integration

## TC-102 — Gate de login obligatorio (US-047)

**Description:** Sin sesión no hay acceso al dropzone.
**Preconditions:** `authStatus !== 'authenticated'`. **Steps:**

1.  Cargar la app. **Expected result:** solo SCR-025 (bienvenida +
    Google); no se renderiza el dropzone (`app/page.tsx:1014-1033`).
    **Type:** E2E *(`tests/app/login-gate.test.tsx`, hoy cita TC-090)*

## TC-103 — Generar ejercicios OK (US-048)

**Description:** POST /api/exercises devuelve un set válido (quiz 5 /
cloze 6 / match 6). **Preconditions:** frases cargadas o tópico.
**Steps:**

1.  Click "GENERAR EJERCICIOS". **Expected result:** `validateSet` pasa;
    se renderizan los tres tipos; dispara `exercises_generation_started`
    y `exercises_generated`. **Type:** Integration
    *(`tests/api/exercises.test.ts`, `tests/app/exercises-panel.test.tsx`)*

## TC-104 — Generación falla → estado error (US-048)

**Description:** Error o set malformado deja el panel en estado 'error'.
**Preconditions:** API responde 4xx/5xx o JSON inválido. **Steps:**

1.  Generar con el mock de error. **Expected result:** mensaje de error;
    dispara `exercises_generation_failed`; el modelo malformado devuelve
    502. **Type:** Integration

## TC-105 — Switch de pestaña PLAYER / EJERCICIOS (US-049)

**Description:** El panel derecho alterna entre player y ejercicios.
**Preconditions:** player abierto. **Steps:**

1.  Click "EJERCICIOS". **Expected result:** se monta `ExercisesPanel`
    (`singleMode="video"`); dispara `exercises_tab_opened`. **Type:**
    Component

## TC-106 — Responder quiz marca correcto/incorrecto (US-050)

**Description:** Elegir opción evalúa la respuesta. **Preconditions:**
quiz generado. **Steps:**

1.  Click en una opción. **Expected result:** feedback correcto/incorrecto;
    dispara `quiz_answered { question_index, selected, correct }`.
    **Type:** Component *(`tests/app/exercises-panel.test.tsx`)*

## TC-107 — Fill-in compara la respuesta (US-050)

**Description:** Submit de un cloze compara contra el valor esperado.
**Preconditions:** cloze generado. **Steps:**

1.  Escribir y enviar. **Expected result:** dispara `cloze_answered {
    item_index, correct }`. **Type:** Component

## TC-108 — Match empareja y completa (US-050)

**Description:** Emparejar todos los pares completa el ejercicio.
**Preconditions:** match generado. **Steps:**

1.  Emparejar cada término con su definición. **Expected result:** cada
    intento dispara `match_pair_attempted`; el último dispara
    `match_completed { total }`. **Type:** Component

## TC-109 — resolveScope 'sel' con fallback a 'all' (US-054)

**Description:** `resolveScope(phrases, 'sel')` usa solo seleccionadas, o
todas si no hay ninguna seleccionada. **Preconditions:** n/a. **Steps:**

1.  Llamar con sel vacío y con sel no vacío. **Expected result:** fallback
    correcto. **Type:** Unit *(`tests/lib/exercises.test.ts`)*

## TC-110 — Validación mode=topic (US-051)

**Description:** Con mode 'topic' se requiere `topic` y `phrases` puede
ir vacío. **Preconditions:** n/a. **Steps:**

1.  POST /api/exercises con mode='topic' sin topic → 400; con topic → OK.
    **Expected result:** validación correcta. **Type:** Integration
    *(`tests/api/exercises-b15.test.ts`)*

## TC-111 — Validación mode=both (US-051)

**Description:** Con mode 'both' se combinan transcripción y tópico.
**Preconditions:** n/a. **Steps:**

1.  POST con mode='both', phrases y topic. **Expected result:** el prompt
    combina ambos; dispara `exercises_source_mode_changed` en el cambio de
    modo. **Type:** Integration *(`tests/api/exercises-b15.test.ts`)*

## TC-112 — Export PDF desde el panel (US-052)

**Description:** El panel de PDF descarga con la versión y tipos
elegidos. **Preconditions:** ejercicios generados. **Steps:**

1.  Elegir tipos y versión, click "DESCARGAR". **Expected result:** se
    genera el PDF; dispara `exercises_pdf_downloaded { version, types,
    source_mode }`. **Type:** Component *(`tests/app/exercises-panel-b15.test.tsx`)*

## TC-113 — Contenido del PDF por tipo (US-052)

**Description:** Los tipos deseleccionados no aparecen en el PDF.
**Preconditions:** set con quiz/cloze/match. **Steps:**

1.  Desmarcar "Match" y descargar. **Expected result:** el PDF no incluye
    match. **Type:** Component *(`tests/app/exercises-panel-b15.test.tsx`)*

## TC-114 — "GENERAR" deshabilitado sin tópico (US-051)

**Description:** En modo topic/both con el campo vacío, el botón está
disabled. **Preconditions:** mode='topic', topic=''. **Steps:**

1.  Observar el botón. **Expected result:** `generateDisabled === true`.
    **Type:** Component *(`tests/app/exercises-panel-b15.test.tsx`)*

## TC-115 — buildStudentContent sin respuestas (US-052)

**Description:** La versión alumno omite las respuestas correctas.
**Preconditions:** ExerciseSet de prueba. **Steps:**

1.  Llamar `buildStudentContent(set, types)`. **Expected result:** quiz
    sin marcar correcta, cloze con `___`, match desordenado. **Type:**
    Unit *(`tests/lib/pdf.test.ts`)*

## TC-116 — buildTeacherContent con respuestas (US-052)

**Description:** La versión profesor marca correctas y rellena blanks.
**Preconditions:** ExerciseSet de prueba. **Steps:**

1.  Llamar `buildTeacherContent(set, types)`. **Expected result:** quiz
    con ✓ + explicación, cloze con la respuesta, match resuelto. **Type:**
    Unit *(`tests/lib/pdf.test.ts`)*

## TC-117 — Versión "Ambas" genera dos PDFs (US-052)

**Description:** pdfVersion='both' produce alumno + profesor.
**Preconditions:** ejercicios generados. **Steps:**

1.  Elegir "Ambas" y descargar. **Expected result:** se generan dos
    documentos. **Type:** Component *(`tests/app/exercises-panel-b15.test.tsx`)*

## TC-134 — Sección topic-only fuerza singleMode (US-053)

**Description:** `screen === 'exercises'` renderiza el panel en modo
topic. **Preconditions:** autenticado, sin video. **Steps:**

1.  Click "Armar ejercicios" en la carga. **Expected result:** panel con
    `phrases=[]` y `singleMode="topic"`; dispara `exercises_section_opened`.
    **Type:** Component *(`tests/app/exercises-section.test.tsx`)*

## TC-135 — Topic-only sin selector de scope (US-053)

**Description:** En topic-only no se muestra el control de scope.
**Preconditions:** sección de ejercicios abierta. **Steps:**

1.  Inspeccionar el panel. **Expected result:** input de tópico visible,
    scope oculto. **Type:** Component *(`tests/app/exercises-section.test.tsx`)*

## TC-136 — Apertura de la ventana autónoma (US-055)

**Description:** "⊞ Abrir generador" abre la ventana y envía las frases.
**Preconditions:** player con frases. **Steps:**

1.  Click "Abrir generador" → `openExercisesWindow()`. **Expected
    result:** `window.open('/exercises-window')`; `load_phrases` por
    `ve-exercises-v1`; dispara `exercises_generator_window_opened`.
    **Type:** Integration *(`tests/app/exercises-window.test.tsx`)*

## TC-137 — La ventana responde 'ready' y recibe las frases (US-055)

**Description:** La ventana emite 'ready' y carga `load_phrases` una vez.
**Preconditions:** ventana abierta. **Steps:**

1.  Montar `/exercises-window`. **Expected result:** envía 'ready';
    convierte las frases a `Phrase[]`; renderiza `ExercisesPanel`.
    **Type:** Component *(`tests/app/exercises-window.test.tsx`)*

## TC-138 — Autonomía tras cerrar el player (US-055)

**Description:** La ventana sigue funcionando aunque el player se cierre.
**Preconditions:** ventana con frases cargadas. **Steps:**

1.  Cerrar el player. **Expected result:** la ventana mantiene su estado
    y permite generar. **Type:** Integration *(`tests/app/exercises-window.test.tsx`)*

## TC-139 — Cierre de la ventana emite 'closed' (US-055)

**Description:** `beforeunload` / "Cerrar generador" notifican al player.
**Preconditions:** ventana abierta. **Steps:**

1.  Cerrar la ventana. **Expected result:** se emite 'closed'; el player
    limpia `exercisesOpen`. **Type:** Integration *(`tests/app/exercises-window.test.tsx`)*

## TC-140 — Botón deshabilitado sin frases (US-055)

**Description:** "Abrir generador" está disabled si `phrases.length ===
0`. **Preconditions:** player sin frases. **Steps:**

1.  Observar el botón. **Expected result:** disabled. **Type:** Component
    *(`tests/app/exercises-window.test.tsx`)*

## TC-141 — Stage reproduce video de biblioteca vía load_url (US-037 / US-055)

**Description:** El stage acepta `load_url` (storage remoto) además de
`load_blob`. **Preconditions:** video abierto desde biblioteca + stage
abierto. **Steps:**

1.  Abrir stage con un video de la biblioteca. **Expected result:** el
    stage carga el video desde `storageUrl`. **Type:** Integration
    *(`tests/app/stage-library.test.tsx`, hoy con placeholders TC-lib /
    TC-library)*

## TC-142 — Stage con video local vía load_blob (US-037)

**Description:** Regresión: el stage sigue aceptando Blob para videos
locales. **Preconditions:** video local + stage. **Steps:**

1.  Abrir stage con un video local. **Expected result:** `load_blob` +
    `URL.createObjectURL`. **Type:** Integration
    *(`tests/app/stage-library.test.tsx`)*

------------------------------------------------------------------------

## Enmienda — nuevo esquema de teclas del player (2026-09-03)

Cubre el remapeo por flechas (US-011/012/013 [Corregida] + US-056).
Tests reales en `tests/app/keyboard-nav.test.tsx`.

## TC-143 — → avanza una frase (US-011)

**Description:** Una pulsación de ArrowRight avanza a la frase siguiente.
**Preconditions:** player con 4 frases, frase activa = 1. **Steps:**

1.  `keyDown` ArrowRight. **Expected result:** contador "2 / 4";
    `currentTime` cerca de `phrase[1].start`. **Type:** Component

## TC-144 — ← retrocede una frase (US-011)

**Description:** Una pulsación de ArrowLeft retrocede una frase.
**Preconditions:** frase activa = 2. **Steps:**

1.  `keyDown` ArrowLeft. **Expected result:** contador "1 / 4". **Type:**
    Component

## TC-145 — mantener → repite y frena al soltar (US-011)

**Description:** Mantener ArrowRight dispara el paso repetidamente
(`NAV_HOLD_MS`) y se detiene en `keyup`. **Preconditions:** player con 4
frases. **Steps:**

1.  `keyDown` ArrowRight y esperar ~1 s. **Expected result:** el seek se
    invoca ≥2 veces (inmediato + intervalo).
2.  `keyUp` ArrowRight y esperar. **Expected result:** no hay más
    invocaciones (el intervalo se limpió). **Type:** Component *(en jsdom
    se mide por invocaciones al seek, no por el índice visible)*

## TC-146 — mantener ← repite en reversa y frena al soltar (US-011)

**Description:** Igual que TC-145 pero con ArrowLeft. **Preconditions:**
player con 4 frases. **Steps:**

1.  `keyDown` ArrowLeft ~1 s → seek ≥2 veces.
2.  `keyUp` → se detiene. **Type:** Component

## TC-147 — ↓ reinicia la frase actual (US-012)

**Description:** ArrowDown lleva el `currentTime` a `phrase.start`.
**Preconditions:** frase activa = 1, `currentTime` avanzado dentro de
ella. **Steps:**

1.  `keyDown` ArrowDown. **Expected result:** `currentTime` ≈
    `phrase[1].start` (+0.05). **Type:** Component

## TC-148 — ↑ salta al inicio de la sección (US-056)

**Description:** ArrowUp lleva al inicio de la sección
(`SECTION_SECONDS = 2`); si ya está en el primer tramo, a `phrase.start`.
**Preconditions:** frase larga (0–10 s). **Steps:**

1.  Con `currentTime = 5.3`, `keyDown` ArrowUp. **Expected result:**
    `currentTime = 4`.
2.  Con `currentTime = 1.2`, `keyDown` ArrowUp. **Expected result:**
    `currentTime = 0` (`phrase.start`). **Type:** Component

## TC-149 — A, D, R, W son no-op (US-011/012/013)

**Description:** Las teclas eliminadas no navegan ni tocan el tiempo.
**Preconditions:** frase activa = 2. **Steps:**

1.  `keyDown` a/A/d/D/r/R/w/W. **Expected result:** contador "2 / 4" y
    `currentTime` sin cambios. **Type:** Component

## TC-150 — atajos no-op con foco en \<input\> (US-011)

**Description:** Con el foco en un input, las flechas no navegan.
**Preconditions:** frase activa = 2. **Steps:**

1.  `keyDown` ArrowRight con `target` = input. **Expected result:**
    contador "2 / 4" (sin cambio). **Type:** Component

## TC-151 — sin intervalos colgados al desmontar (US-011)

**Description:** Al desmontar el player durante un barrido, el intervalo
se limpia. **Preconditions:** ArrowRight mantenida (intervalo activo).
**Steps:**

1.  `unmount()`. **Expected result:** `clearInterval` se invoca en el
    cleanup. **Type:** Component

## TC-152 — el barrido frena en los extremos (US-011)

**Description:** Mantener → en la última frase (o ← en la primera) no
arranca el auto-repeat. **Preconditions:** frase activa en un extremo.
**Steps:**

1.  `keyDown` ArrowRight en la última (y ArrowLeft en la primera) ~1 s.
    **Expected result:** el seek se invoca a lo sumo una vez (re-seek
    inmediato); no hay intervalo. **Type:** Component

## **User Stories — Virtual English Player**

**Usuario objetivo:** profesor de inglés que comparte su pantalla por
Zoom y reproduce un video con subtítulos sincronizados para su alumno,
controlando la reproducción frase por frase.

### **Bloque 1 — Carga de archivo**

#### **US-001 — Carga de video**

COMO profesor\
QUIERO arrastrar un archivo de video al área de carga o seleccionarlo
desde el explorador\
PARA prepararlo para la reproducción en clase

**Casos de uso**

UC-01 El profesor arrastra uno o más archivos al dropzone; se ejecuta
handleFiles(Array.from(e.dataTransfer.files)).\
UC-02 El profesor hace clic en el dropzone, lo que activa el \<input
type="file"\> oculto, y selecciona un archivo desde el explorador.\
UC-03 Si se detecta un archivo de video válido, se genera una URL de
objeto con URL.createObjectURL y se almacena en videoUrl y
videoFileName.\
UC-04 Si no se detecta ningún archivo de video entre los archivos
soltados, se muestra un mensaje de error y el flujo se detiene.

**Reglas**

- Se aceptan extensiones: .mp4, .avi, .mkv, .mov, .webm, .m4v.

- El tipo del archivo debe comenzar con video/ o la extensión debe
  coincidir con /.(avi\|mp4\|mkv\|mov\|webm\|m4v)\$/i.

- El \<input\> acepta también .srt para permitir la carga combinada (ver
  US-002).

- Si no hay archivo de video, errorMsg toma el valor 'Arrastrá un
  archivo de video (MP4, AVI, MKV...)' y no se avanza de pantalla.

- Mientras transcurre la transcripción (isTranscribing = true), el
  dropzone se reemplaza por el cuadro de progreso y no puede recibir
  nuevos archivos.

#### **US-002 — Carga combinada video + SRT**

COMO profesor\
QUIERO arrastrar un video junto con un archivo SRT ya existente\
PARA saltear la transcripción automática y usar mis subtítulos
directamente

**Casos de uso**

UC-01 El profesor suelta un archivo de video y un archivo .srt (o .vtt)
al mismo tiempo sobre el dropzone.\
UC-02 handleFiles detecta ambos tipos: vf (video) y sf (subtítulos).\
UC-03 El SRT se lee con FileReader.readAsText(srtFile, 'UTF-8').\
UC-04 parseSRT procesa el contenido y devuelve el array de frases.\
UC-05 Si parseSRT devuelve un array vacío, se muestra 'El SRT no tiene
subtítulos válidos.' y el flujo se detiene.\
UC-06 Si la carga es exitosa, srtSource toma el valor "SRT · N frases" y
la pantalla cambia a 'player'.

**Reglas**

- Un archivo SRT se detecta por la extensión /.(srt\|vtt)\$/i.

- La presencia de un SRT tiene prioridad: si se detecta, no se llama a
  transcribe().

- parseSRT normaliza CRLF a LF, elimina code fences de Gemini, y acepta
  timestamps en formato HH:MM:SS,mmm o MM:SS.

- Las etiquetas HTML dentro del texto SRT (p. ej. \<i\>) se eliminan con
  replace(/\<\[^\>\]+\>/g, '').

- Si el SRT no contiene bloques con --\>, parseSRT devuelve array vacío.

### **Bloque 2 — Transcripción automática**

#### **US-003 — Transcripción con Gemini AI**

COMO profesor\
QUIERO subir un video sin SRT para que Gemini genere los subtítulos
automáticamente\
PARA no tener que crear ni buscar el archivo de subtítulos

**Casos de uso**

UC-01 Se llama a transcribe(videoFile): se crea un FormData con el video
y se envía vía XMLHttpRequest a POST /api/transcribe.\
UC-02 Durante la subida, xhr.upload.onprogress actualiza step =
'uploading', el mensaje con el porcentaje, y progress en el rango 5 %–35
%.\
UC-03 Al completarse la subida (xhr.upload.onloadend), step pasa a
'transcribing', progress salta a 40 % y comienza un intervalo de
animación que avanza de forma aleatoria hasta 88 %.\
UC-04 En el servidor, el video se sube a Gemini con protocolo
reanudable, se espera a que el archivo quede ACTIVE (hasta 30 × 3 s) y
se llama a gemini-2.5-flash:generateContent con un prompt estricto que
exige salida SRT pura.\
UC-05 En xhr.onload con status 2xx, se llama a parseSRT(data.srt). Si
produce frases, progress pasa a 100 % y tras 300 ms la pantalla cambia a
'player'.\
UC-06 Si data.error está presente, parseSRT devuelve 0 frases, o el
status HTTP no es 2xx, se muestra errorMsg y se resetea el estado a
idle.\
UC-07 Si ocurre un error de red, xhr.onerror muestra 'Error de red.
Verificá tu conexión.'.

**Reglas**

- El XHR se guarda en xhrRef.current para poder cancelarlo sin desmontar
  el componente.

- El GEMINI_API_KEY nunca sale del servidor; el frontend solo habla con
  /api/transcribe.

- maxDuration de la ruta es 300 s (requiere Vercel Pro; Hobby Plan tiene
  límite de 60 s).

- El servidor elimina el archivo de Gemini de forma best-effort tras
  obtener la transcripción (DELETE fire-and-forget).

- generationConfig.temperature = 0.0 para máxima determinismo en la
  transcripción.

- El intervalo de animación de progreso se cancela al recibir cualquier
  respuesta del servidor.

**Estados**

- idle: sin proceso activo; se muestra el dropzone.

- uploading: XHR enviando el video al servidor.

- transcribing: video recibido por el servidor; Gemini procesando el
  audio.

- parsing: parseo local del SRT recibido (estado transitorio, muy
  breve).

- done: transcripción completada; inicia la transición a la pantalla del
  player.

#### **US-004 — Cancelación de transcripción**

COMO profesor\
QUIERO poder cancelar la transcripción en curso\
PARA no quedar bloqueado si el proceso tarda demasiado o cargué el
archivo equivocado

**Casos de uso**

UC-01 El profesor hace clic en "Cancelar" durante step = 'uploading' o
step = 'transcribing'.\
UC-02 Se llama a xhrRef.current.abort() y xhrRef.current se establece en
null.\
UC-03 step regresa a 'idle', progress a 0, errorMsg muestra
'Cancelado.', y se borran videoUrl y videoFileName.\
UC-04 El dropzone vuelve a ser visible e interactivo.

**Reglas**

- El botón "Cancelar" solo es visible cuando isTranscribing es true (es
  decir, step !== 'idle' && step !== 'done').

- Abortar el XHR no dispara xhr.onload; el estado se resetea
  exclusivamente dentro de cancelTranscription().

#### **US-005 — Descarga automática del SRT generado**

COMO profesor\
QUIERO que el SRT generado por Gemini se descargue automáticamente al
terminar la transcripción\
PARA tenerlo disponible para la próxima clase sin pasos extra

**Casos de uso**

UC-01 Tras un xhr.onload exitoso con frases válidas, se crea un Blob con
el contenido SRT devuelto por el servidor.\
UC-02 Se genera un blob URL y se crea un \<a\> temporal con href = blob
URL y download = nombre del video con extensión .srt.\
UC-03 El elemento se agrega al DOM, se dispara .click() y se elimina del
DOM inmediatamente.\
UC-04 La descarga ocurre antes de la transición a 'player'.

**Reglas**

- El nombre del archivo se obtiene reemplazando la extensión del video:
  videoFile.name.replace(/.\[^.\]+\$/, '') + '.srt'.

- La descarga es automática e inmediata; no hay opción de omitirla.

- El SRT descargado es el texto crudo devuelto por el servidor, antes de
  cualquier edición del usuario en el player.

### **Bloque 3 — Reproducción**

#### **US-006 — Play / Pause**

COMO profesor\
QUIERO reproducir y pausar el video con un botón o con la tecla Space\
PARA controlar el ritmo de la clase sin usar el mouse

**Casos de uso**

UC-01 El profesor hace clic en el botón de play/pause: se llama a
togglePlay().\
UC-02 El profesor presiona Space con el foco fuera de un \<input\>: se
llama a togglePlay().\
UC-03 Si el video estaba pausado, se llama a v.play() y isPlaying pasa a
true.\
UC-04 Si el video estaba reproduciendo, se llama a v.pause() y isPlaying
pasa a false.\
UC-05 Al terminar el video (evento ended), isPlaying pasa a false y
subText se vacía.

**Reglas**

- El atajo Space es un no-op si (e.target as HTMLElement).tagName ===
  'INPUT'.

- El ícono del botón alterna entre triángulo (play) y dos rectángulos
  (pause) según isPlaying.

- Los atajos de teclado solo se registran cuando screen === 'player'.

**Estados**

- isPlaying = false: video pausado; ícono de play visible.

- isPlaying = true: video en reproducción; ícono de pause visible.

#### **US-007 — Skip ±10 segundos**

COMO profesor\
QUIERO avanzar o retroceder 10 segundos con los botones de salto\
PARA pasar silencios largos o segmentos irrelevantes rápidamente

**Casos de uso**

UC-01 Se hace clic en el botón de retroceso: se llama a skip(-10).\
UC-02 Se hace clic en el botón de avance: se llama a skip(+10).\
UC-03 skip(s) establece v.currentTime = Math.max(0, Math.min(v.duration
\|\| 0, v.currentTime + s)).

**Reglas**

- El salto está siempre acotado entre 0 y video.duration.

- No hay atajos de teclado para skip ±10; las teclas ←/→ están
  reservadas para navegación de frases.

#### **US-008 — Scrubbing en la barra de progreso**

COMO profesor\
QUIERO hacer clic en cualquier punto de la barra de progreso para ir a
esa posición\
PARA saltar a cualquier parte del video directamente

**Casos de uso**

UC-01 El profesor hace clic sobre la pista de progreso (progRef): se
llama a scrub(e).\
UC-02 Se calcula la posición relativa: (e.clientX - r.left) / r.width,
acotada entre 0 y 1.\
UC-03 v.currentTime se establece al valor proporcional a v.duration.\
UC-04 Los tick marks de las frases son indicadores visuales sobre la
pista: los no seleccionados aparecen en blanco semitransparente y los
seleccionados en ámbar.

**Reglas**

- El scrubbing solo funciona si v.duration existe y es mayor que 0.

- El pseudo-elemento ::before de la pista amplía la zona táctil 6 px
  arriba y abajo.

- Los tick marks no son elementos interactivos; el clic siempre cae
  sobre la pista.

#### **US-009 — Control de velocidad de reproducción**

COMO profesor\
QUIERO cambiar la velocidad del video entre 0.5× y 1.5×\
PARA ajustar el ritmo al nivel de comprensión auditiva del alumno

**Casos de uso**

UC-01 El profesor hace clic en uno de los cinco botones de velocidad: se
llama a setSpd(idx).\
UC-02 speedIdx se actualiza y video.playbackRate se establece al valor
del array SPEEDS.

**Reglas**

- Las velocidades disponibles son exactamente: \[0.5, 0.75, 1.0, 1.25,
  1.5\].

- El botón activo se resalta con fondo y borde ámbar (spAct).

- El valor por defecto es speedIdx = 2 (1.0×).

- No hay atajo de teclado para cambiar la velocidad.

#### **US-010 — Control de volumen**

COMO profesor\
QUIERO ajustar el volumen con un slider o con las teclas ↑/↓\
PARA adaptar el nivel de audio al entorno de la clase o a auriculares

**Casos de uso**

UC-01 El profesor mueve el slider de volumen (\<input type="range"\>):
vol se actualiza y v.volume = value / 100.\
UC-02 El profesor presiona ↑ (sin input enfocado): v.volume =
Math.min(1, v.volume + 0.1).\
UC-03 El profesor presiona ↓ (sin input enfocado): v.volume =
Math.max(0, v.volume - 0.1).

**Reglas**

- El slider va de 0 a 100; el volumen nativo del elemento video va de
  0.0 a 1.0.

- El valor numérico se muestra siempre en porcentaje junto al slider.

- Los atajos ↑/↓ son no-op cuando un \<input\> está enfocado.

- **[Corregida 2026-09-03]** Los atajos de teclado ↑/↓ para volumen se
  **eliminaron** al reasignar las flechas al nuevo esquema de navegación
  (↑ = salto de sección, ↓ = reiniciar frase; ver US-011/012/056). El
  volumen queda **solo por el slider** (`app/page.tsx:238-267`). El slider
  y su regla de 0–100 no cambian.

### **Bloque 4 — Navegación de frases**

#### **US-011 — Navegación entre frases**

COMO profesor\
QUIERO saltar a la frase anterior o siguiente con botones o teclado\
PARA controlar qué línea está escuchando el alumno en cada momento

**Casos de uso**

UC-01 El profesor hace clic en "Anterior" o presiona ←/A: se llama a
prevPhrase() → jumpTo(Math.max(0, curIdxRef.current - 1)).\
UC-02 El profesor hace clic en "Siguiente" o presiona →/D: se llama a
nextPhrase() → jumpTo(Math.min(phrases.length - 1, curIdxRef.current +
1)).\
UC-03 jumpTo(idx) establece curIdx = idx y v.currentTime =
phrases\[idx\].start + 0.05.\
UC-04 Al cambiar curIdx, un useEffect hace scroll suave al elemento
\[data-act="true"\] de la lista de frases.

**Reglas**

- La navegación está acotada: no baja de 0 ni supera phrases.length - 1.

- El offset de +0.05 s garantiza que la frase sea detectada de inmediato
  por el loop de sincronización.

- La frase activa en la lista se resalta con borde izquierdo ámbar y
  fondo semitransparente.

- El contador N / Total en el panel refleja el curIdx actual.

- Los atajos son no-op cuando un \<input\> está enfocado.

- **[Corregida 2026-09-03]** La navegación por teclado es ahora **solo por
  flechas**: → = siguiente, ← = anterior. Las teclas **A y D se eliminaron**
  (no quedan como alias). Además, **mantener presionada** → o ← activa un
  **barrido continuo** frase a frase por un loop propio (`setInterval` a
  `NAV_HOLD_MS = 450 ms`, `app/page.tsx:238-267`), que ignora el
  auto-repeat del OS (`e.repeat`), respeta los límites (no pasa de la
  primera/última) y se corta en `keyup`, `blur`, cambio de pantalla o
  desmontaje. Los botones "Anterior"/"Siguiente" no cambian.

#### **US-012 — Repetir frase actual**

COMO profesor\
QUIERO repetir la frase actual con un botón o la tecla R\
PARA que el alumno escuche de nuevo una oración difícil

**Casos de uso**

UC-01 El profesor hace clic en "Repetir" o presiona R: se llama a
repeatPhrase().\
UC-02 Si curIdxRef.current \>= 0, v.currentTime se establece a
phrases\[curIdxRef.current\].start + 0.05.\
UC-03 El video continúa reproduciéndose desde el inicio de la frase sin
pausar.

**Reglas**

- repeatPhrase() no hace nada si curIdx = -1 (ninguna frase activa
  todavía).

- El atajo R es no-op si un \<input\> está enfocado.

- **[Corregida 2026-09-03]** El atajo cambió de **R** a **↓** (ArrowDown);
  la tecla R se eliminó. La función `repeatPhrase()` y el botón (renombrado
  a "Reiniciar", con badge ↓) no cambian su comportamiento
  (`app/page.tsx:238-267`, botón en la leyenda del panel).

#### **US-013 — Micro-repetición (retroceso de 2 s)**

COMO profesor\
QUIERO retroceder exactamente 2 segundos con la tecla W o el botón
"Micro-rep."\
PARA que el alumno escuche las últimas palabras sin reiniciar toda la
frase

**Casos de uso**

UC-01 El profesor hace clic en "Micro-rep." o presiona W: se llama a
microRepeat().\
UC-02 v.currentTime se establece a Math.max(phrases\[curIdx\].start,
v.currentTime - 2).\
UC-03 Para dar feedback visual, subVisible se establece en false y luego
en true tras 80 ms.

**Reglas**

- El retroceso está acotado al inicio de la frase actual; no puede ir
  antes de phrases\[curIdx\].start.

- microRepeat() es un no-op si curIdxRef.current \< 0 o vidRef.current
  es null.

- El atajo W es no-op si un \<input\> está enfocado.

- **[Corregida 2026-09-03]** La micro-repetición fue **eliminada por
  completo**: se removieron la tecla **W**, el botón "Micro-rep." del panel
  y la función `microRepeat()`. Su rol de "escuchar el último tramo sin
  reiniciar la frase" quedó **reemplazado por el salto de sección** de la
  tecla ↑ (grilla fija programable), documentado en **US-056**. La US-013 se
  conserva como histórico de la feature original.

### **Bloque 5 — Subtítulos**

#### **US-014 — Subtítulos sincronizados sobre el video**

COMO profesor\
QUIERO ver subtítulos superpuestos sobre el video, sincronizados con el
audio\
PARA que el alumno que mira por Zoom pueda leer mientras escucha

**Casos de uso**

UC-01 El loop RAF (requestAnimationFrame) comprueba en cada frame si
v.currentTime - delayRef.current cae dentro del rango \[p.start, p.end\]
de alguna frase. Si sí, establece subText y subVisible = true.\
UC-02 El listener timeupdate realiza la misma comprobación como doble
cobertura para garantizar sync cuando el video está pausado.\
UC-03 Si t no cae en ninguna frase, subVisible = false y subText = ''.\
UC-04 hl(subText) convierte el texto en ReactNode\[\], envolviendo las
palabras de contenido en \<span style="color:#E8C547"\>.\
UC-05 El overlay solo se renderiza si ccOn && subText son ambos
verdaderos.

**Reglas**

- Las palabras de contenido destacadas son aquellas con más de 3
  caracteres que no están en el set SKIP (stop-words en inglés y español
  definidas en lib/hl.tsx).

- La sincronización usa v.currentTime - delayRef.current para aplicar el
  offset configurado.

- phrasesRef, ccRef y delayRef son refs que permiten al RAF y a los
  listeners leer valores frescos sin re-binding de funciones.

- El RAF solo corre cuando screen === 'player' y se cancela al desmontar
  con cancelAnimationFrame.

- El rendering de hl() vía React es seguro contra XSS: el contenido se
  trata como nodos de texto, nunca como HTML crudo.

#### **US-015 — Activar / desactivar subtítulos**

COMO profesor\
QUIERO apagar los subtítulos en plena reproducción\
PARA evaluar la comprensión del alumno sin el apoyo visual del texto

**Casos de uso**

UC-01 El profesor hace clic en el botón "Subtítulos": se llama a
setCcOn(prev =\> !prev).\
UC-02 ccRef.current se actualiza en el useEffect correspondiente para
que el RAF use el valor nuevo de inmediato.\
UC-03 Si ccOn = false, el overlay no se renderiza aunque subText tenga
contenido.

**Reglas**

- El badge del botón muestra "ON" con fondo ámbar, o "OFF" con fondo
  gris.

- Desactivar los subtítulos no detiene la reproducción ni modifica las
  frases cargadas.

- No hay atajo de teclado para este toggle.

**Estados**

- ccOn = true: subtítulos visibles; badge "ON" en ámbar.

- ccOn = false: subtítulos ocultos; badge "OFF" en gris.

#### **US-016 — Ajuste de delay de subtítulos**

COMO profesor\
QUIERO adelantar o atrasar el tiempo de aparición de los subtítulos en
pasos de 0.5 s\
PARA corregir una desincronización entre el audio y el texto

**Casos de uso**

UC-01 El profesor hace clic en "+" o "−": se llama a adjDelay(±0.5).\
UC-02 adjDelay(d) actualiza delay con redondeo a 1 decimal
(Math.round((prev + d) \* 10) / 10) y sincroniza delayRef.current de
forma inmediata.\
UC-03 El delay se aplica en tiempo real: tanto el RAF como timeupdate
usan v.currentTime - delayRef.current.\
UC-04 El profesor hace clic en "reset": delay y delayRef.current vuelven
a 0.

**Reglas**

- El delay puede ser negativo (retrasa los subtítulos) o positivo (los
  adelanta).

- El ajuste está acotado a un rango de ±10 s para evitar valores
  absurdos (ver enmienda al final del documento).

- El valor se muestra formateado con un decimal (p. ej. +1.0 s).

**Estados**

- delay = 0: sin compensación; valor mostrado en ámbar.

- delay \> 0: subtítulos adelantados respecto al audio; valor mostrado
  en azul (#4B8FD8).

- delay \< 0: subtítulos atrasados respecto al audio; valor mostrado en
  rojo (#CC4444).

### **Bloque 6 — Gestión de frases**

#### **US-017 — Selección de frases para secuencia personalizada**

COMO profesor\
QUIERO marcar frases individuales con un checkbox\
PARA construir un subconjunto de oraciones para practicar con el alumno

**Casos de uso**

UC-01 El profesor hace clic en el checkbox de una fila de frase: se
llama a toggleSel(idx).\
UC-02 toggleSel actualiza el array de frases invirtiendo p.sel para el
índice dado (inmutable con map).\
UC-03 Las frases seleccionadas muestran un tick de verificación en el
checkbox y un fondo diferenciado.\
UC-04 El contador "N sel." en el header del panel y en la meta del
reproductor se actualiza reactivamente.\
UC-05 Los tick marks de las frases seleccionadas en la barra de progreso
aparecen en ámbar (ptickSel).

**Reglas**

- Todas las frases se inicializan con sel: true (parseSRT las crea así).

- Hacer clic en el checkbox no navega a la frase: el evento tiene
  e.stopPropagation().

- La selección es en memoria; no persiste entre sesiones ni se incluye
  en el SRT descargado.

#### **US-018 — Filtrar la lista de frases**

COMO profesor\
QUIERO ver solo las frases seleccionadas en la lista de frases\
PARA revisar y navegar exclusivamente mi secuencia de práctica
personalizada

**Casos de uso**

UC-01 El profesor hace clic en "Sel.": filter cambia a 'sel';
showPhrases muestra phrases.filter(p =\> p.sel).\
UC-02 El profesor hace clic en "Todas": filter cambia a 'all';
showPhrases muestra todos los elementos de phrases.\
UC-03 Hacer clic en una frase de la lista filtrada llama a jumpTo(oi),
donde oi = phrases.indexOf(p) es el índice en el array original.

**Reglas**

- El botón de filtro activo se resalta con fondo y borde ámbar
  (plFilterAct).

- El índice pasado a jumpTo es siempre el del array phrases original, no
  el de showPhrases.

- Si no hay frases seleccionadas y el filtro es 'sel', la lista muestra
  el mensaje vacío "Sin frases".

**Estados**

- filter = 'all': lista muestra todas las frases; botón "Todas" activo.

- filter = 'sel': lista muestra solo frases con sel: true; botón "Sel."
  activo.

#### **US-019 — Edición inline de frases**

COMO profesor\
QUIERO corregir el texto de una frase directamente en la lista\
PARA corregir errores de transcripción sin salir del player

**Casos de uso**

UC-01 El profesor hace clic en el ícono de lápiz de una fila: se llama a
startEdit(idx), que establece editingIdx = idx y editingText =
phrases\[idx\].text.\
UC-02 La fila renderiza un \<input autoFocus\> pre-cargado con el texto;
los atajos de teclado del player son inactivos mientras el input esté
enfocado.\
UC-03 El profesor modifica el texto y presiona Enter o hace clic en ✓:
se llama a saveEdit(idx), que actualiza phrases\[idx\].text con
editingText y resetea editingIdx = null.\
UC-04 El profesor presiona Escape o hace clic en ✕: se llama a
cancelEdit(), el texto original no cambia y editingIdx vuelve a null.\
UC-05 Hacer clic en una fila mientras editingIdx === oi no ejecuta
jumpTo() (condición if (editingIdx !== oi) en el onClick de la fila).

**Reglas**

- Solo una frase puede estar en modo edición a la vez (editingIdx es un
  número o null).

- El \<input\> recibe autoFocus al montarse.

- Los clicks dentro del área de edición tienen e.stopPropagation() para
  no disparar jumpTo.

**Estados**

- editingIdx = null: ninguna frase en edición; todos los textos son de
  solo lectura.

- editingIdx = N: la fila N muestra el input y los botones ✓/✕; las
  demás filas siguen siendo navegables.

### **Bloque 7 — Gestión del archivo SRT**

#### **US-020 — Descarga manual del SRT desde el player**

COMO profesor\
QUIERO descargar el SRT actual (incluyendo ediciones) desde el player\
PARA guardar mis correcciones y reutilizarlas en futuras clases

**Casos de uso**

UC-01 El profesor hace clic en "↓ SRT": se llama a downloadSRT().\
UC-02 Se construye el contenido SRT iterando sobre phrases: cada bloque
incluye número secuencial, timestamps formateados y el texto de la
frase.\
UC-03 Se crea un Blob con tipo 'text/plain', se genera un blob URL y se
descarga con un \<a\> temporal.

**Reglas**

- Si phrases.length === 0, downloadSRT() retorna sin hacer nada.

- El nombre del archivo es videoFileName.replace(/.\[^.\]+\$/, '') +
  '.srt'.

- Los timestamps se formatean con cero-padding: HH:MM:SS,mmm (p. ej.
  00:01:23,456).

- Los bloques SRT están separados por una línea en blanco.

- El archivo descargado incluye cualquier edición inline realizada
  durante la sesión.

### **Bloque 8 — Navegación global**

#### **US-021 — Volver a la pantalla de carga**

COMO profesor\
QUIERO volver a la pantalla de carga desde el player\
PARA cargar un video diferente sin recargar la página

**Casos de uso**

UC-01 El profesor hace clic en "← Cargar otro": se llama a
backToLoad().\
UC-02 El video se pausa y su src se vacía: v.pause(); v.src = ''.\
UC-03 screen vuelve a 'load' y se resetean: step, progress, phrases,
curIdx, isPlaying, videoUrl, errorMsg, srtSource.

**Reglas**

- Toda la sesión de reproducción (selección de frases, ediciones, delay,
  velocidad) se pierde al salir (salvo lo cubierto por la persistencia
  de US-023/US-024 y la confirmación de US-025).

- Sin la confirmación de US-025, no se pide aviso al usuario antes de
  salir.

#### **US-022 — Layout optimizado para compartir en Zoom**

COMO profesor\
QUIERO que el video y los controles estén en áreas visualmente
separadas\
PARA compartir solo la zona del video por Zoom sin que el alumno vea mis
controles

**Casos de uso**

UC-01 El player usa un layout de dos columnas: columna izquierda (stage)
con el video y los subtítulos, columna derecha (panel) con todos los
controles.\
UC-02 Un hint de texto "Compartir en Zoom — el alumno solo ve esto"
flota sobre la zona del video con pointer-events: none.\
UC-03 El chip "Zoom" en la topbar muestra un punto verde pulsante como
indicador de estado en vivo.\
UC-04 El badge "⊘ Solo profesor" en la sección "Reproduciendo" del panel
recuerda que ese panel no debe compartirse.

**Reglas**

- La columna de video ocupa el espacio restante (1fr); el panel tiene
  ancho fijo de 268 px.

- El hint de Zoom es puramente decorativo (pointer-events: none); no
  interfiere con los controles del video.

- El layout es display: grid; grid-template-columns: 1fr 268px y no es
  responsive (diseñado para uso en desktop).

- La separación en ventana/monitor independiente se especifica en el
  Bloque 12 (US-037 a US-039).

### **Bloque 9 — Persistencia y sesión**

#### **US-023 — Guardado automático de la sesión de trabajo**

COMO profesor\
QUIERO que mis ediciones, selección, delay y velocidad se guarden
automáticamente\
PARA no perder el trabajo de preparación de la clase si recargo o cierro
la pestaña

**Casos de uso**

UC-01 Cada vez que cambia phrases, delay o speedIdx, un useEffect con
debounce (≈500 ms) serializa el estado de sesión a localStorage.\
UC-02 La clave de almacenamiento se deriva de una firma del video:
ve-session:{videoFileName}:{fileSize}.\
UC-03 El objeto guardado incluye: array de frases (con texto editado y
sel), delay, speedIdx, ccOn y filter.\
UC-04 El video en sí no se persiste (es un File/blob URL no
serializable); solo se guarda el estado asociado.

**Reglas**

- El GEMINI_API_KEY ni ningún dato de servidor se escribe nunca en
  localStorage (solo estado de sesión del cliente).

- El guardado es best-effort: si localStorage falla (cuota, modo
  privado), se ignora silenciosamente sin romper el player.

- La firma usa nombre + tamaño porque dos videos distintos con el mismo
  nombre tendrían tamaños distintos.

#### **US-024 — Restauración de la sesión al recargar el mismo video**

COMO profesor\
QUIERO que al volver a cargar el mismo video se ofrezca restaurar mi
sesión anterior\
PARA retomar la preparación donde la dejé sin rehacer las correcciones

**Casos de uso**

UC-01 Al cargar un video (US-001), se calcula su firma y se busca una
sesión guardada con esa clave.\
UC-02 Si existe una sesión y el video trae además un SRT/transcripción,
se muestra un aviso "Hay una sesión guardada para este video —
¿Restaurar?".\
UC-03 Si el profesor confirma, se reemplazan phrases, delay, speedIdx,
ccOn y filter por los valores guardados.\
UC-04 Si el profesor descarta, se procede con la transcripción/SRT nuevo
y la sesión guardada se sobreescribe al primer cambio.

**Reglas**

- La restauración solo se ofrece si el conteo de frases guardado
  coincide con el del SRT/transcripción actual; si difiere, se ignora la
  sesión vieja para evitar desalineación de timestamps.

- El aviso no bloquea la pantalla; si no se responde, por defecto no
  restaura.

#### **US-025 — Confirmación antes de descartar la sesión**

COMO profesor\
QUIERO que se me pida confirmación antes de salir del player con cambios
sin guardar\
PARA no perder ediciones por un clic accidental en "Cargar otro"

**Casos de uso**

UC-01 Al hacer clic en "← Cargar otro" (US-021), si hay ediciones inline
o selección distinta de la inicial, se muestra un diálogo de
confirmación.\
UC-02 El diálogo ofrece tres acciones: "Descargar SRT y salir", "Salir
sin guardar" y "Cancelar".\
UC-03 "Cancelar" cierra el diálogo y mantiene la sesión activa intacta.

**Reglas**

- El diálogo solo aparece si dirty === true (hubo al menos una edición
  de texto, cambio de selección, o ajuste de delay/velocidad respecto
  del estado inicial).

- Si no hay cambios, "Cargar otro" sale directo sin confirmación
  (comportamiento actual de US-021).

**Estados**

- dirty = false: sin cambios; salida directa.

- dirty = true: hay cambios sin guardar; salida con confirmación.

### **Bloque 10 — Modo práctica (activación)**

#### **US-026 — Auto-pausa al final de cada frase**

COMO profesor\
QUIERO que el video se pause automáticamente al terminar cada frase\
PARA que el alumno produzca o responda antes de pasar a la siguiente
línea

**Casos de uso**

UC-01 El profesor activa el toggle "Auto-pausa": autoPause pasa a true y
autoPauseRef.current se sincroniza.\
UC-02 En el loop RAF (US-014), cuando v.currentTime - delayRef.current
supera phrases\[curIdx\].end y autoPauseRef.current es true, se llama a
v.pause() e isPlaying pasa a false.\
UC-03 Con el video pausado al final de frase, el profesor avanza con
"Siguiente" (US-011) o repite con R/W (US-012/US-013).

**Reglas**

- La auto-pausa se dispara una sola vez por frase: un flag pausedAtRef
  evita re-pausar en el mismo límite.

- Al navegar a otra frase o hacer play manual, el flag se resetea.

- El toggle no afecta la sincronización de subtítulos ni la lista de
  frases.

**Estados**

- autoPause = false: reproducción continua (comportamiento actual).

- autoPause = true: el video frena al final de cada frase.

#### **US-027 — Reproducir solo las frases seleccionadas en secuencia**

COMO profesor\
QUIERO reproducir únicamente las frases que marqué, una tras otra\
PARA practicar mi secuencia personalizada sin pasar por el resto del
video

**Casos de uso**

UC-01 El profesor activa "Modo práctica": practiceMode pasa a true
usando el subconjunto phrases.filter(p =\> p.sel) en orden de
timestamp.\
UC-02 Al terminar una frase seleccionada, en vez de continuar
linealmente, el player salta al start de la siguiente frase seleccionada
(v.currentTime = next.start + 0.05).\
UC-03 Si se llega a la última frase seleccionada, el video se pausa e
isPlaying pasa a false.\
UC-04 La navegación "Anterior/Siguiente" (US-011) respeta el subconjunto
seleccionado mientras practiceMode esté activo.

**Reglas**

- Si no hay frases seleccionadas, el botón "Modo práctica" está
  deshabilitado.

- El modo práctica es compatible con auto-pausa (US-026): si ambos están
  activos, frena al final de cada frase seleccionada.

- El orden de reproducción es siempre por timestamp, no por orden de
  selección.

**Estados**

- practiceMode = false: reproducción lineal sobre todo el video.

- practiceMode = true: reproducción saltando solo entre frases con sel:
  true.

#### **US-028 — Loop de la frase actual N veces**

COMO profesor\
QUIERO repetir automáticamente la frase actual una cantidad configurable
de veces\
PARA drillear una oración difícil sin tener que presionar R en cada
repetición

**Casos de uso**

UC-01 El profesor define un contador de loops (loopCount, p. ej. 1–5) y
activa "Loop".\
UC-02 Al llegar al end de la frase actual, si quedan repeticiones,
v.currentTime vuelve a phrases\[curIdx\].start + 0.05 y se decrementa el
contador interno.\
UC-03 Al agotar las repeticiones, el comportamiento depende de los otros
toggles: pausa si auto-pausa está activa, o continúa normalmente.

**Reglas**

- El loop opera siempre sobre curIdx; cambiar de frase reinicia el
  contador interno a loopCount.

- loopCount = 1 equivale a reproducción normal (sin repetición extra).

- No hay atajo de teclado para configurar el número de loops.

#### **US-029 — Revelar el subtítulo de la frase actual a demanda**

COMO profesor\
QUIERO mostrar el texto de la frase actual puntualmente cuando los
subtítulos están apagados\
PARA usar la técnica de "primero el alumno produce, después revelo el
texto"

**Casos de uso**

UC-01 Con ccOn = false (US-015), el profesor hace clic en "Revelar" o
presiona la tecla C: el overlay muestra subText solo para la frase
actual.\
UC-02 El texto revelado permanece visible hasta que cambia la frase
activa, momento en el que se vuelve a ocultar.\
UC-03 Si ccOn = true, "Revelar" no tiene efecto (los subtítulos ya están
visibles).

**Reglas**

- "Revelar" usa un flag transitorio revealOnce que no modifica ccOn; al
  pasar de frase, revealOnce vuelve a false.

- El atajo C es no-op si un \<input\> está enfocado.

### **Bloque 11 — Edición avanzada de frases**

#### **US-030 — Edición de los timestamps de una frase**

COMO profesor\
QUIERO ajustar el inicio y el fin de una frase individual\
PARA corregir una desincronización puntual sin tocar el delay global

**Casos de uso**

UC-01 En modo edición de una fila (US-019), además del texto se muestran
dos campos de tiempo editables (start y end) en formato MM:SS,mmm.\
UC-02 Al guardar (saveEdit), se parsean los timestamps y se actualizan
phrases\[idx\].start y phrases\[idx\].end.\
UC-03 Si start \>= end o el formato es inválido, se muestra un error
inline y no se guarda.

**Reglas**

- El ajuste de timestamps por frase es independiente del delay global
  (US-016).

- Editar los timestamps actualiza también la posición del tick en la
  barra de progreso (US-008).

#### **US-031 — Dividir y unir frases**

COMO profesor\
QUIERO dividir una frase en dos o unir dos frases consecutivas\
PARA corregir segmentaciones erróneas de la transcripción

**Casos de uso**

UC-01 Dividir: el profesor coloca el cursor en un punto del texto y hace
clic en "Dividir"; se crean dos frases, repartiendo el rango de tiempo
proporcional a la longitud del texto.\
UC-02 Unir: el profesor hace clic en "Unir con siguiente"; el texto se
concatena y el rango pasa a ser \[frase.start, siguiente.end\].\
UC-03 Tras dividir o unir, phrases se reindexa y curIdx se ajusta para
seguir apuntando a la frase visible.

**Reglas**

- Unir requiere que exista una frase siguiente; en la última frase la
  acción está deshabilitada.

- El estado de selección (sel) de la frase resultante de una unión es
  true si cualquiera de las dos originales estaba seleccionada.

#### **US-032 — Agregar y eliminar frases**

COMO profesor\
QUIERO agregar una frase nueva o eliminar una existente\
PARA cubrir un tramo sin subtítulo o quitar una línea espuria

**Casos de uso**

UC-01 Agregar: el profesor hace clic en "+ Frase"; se inserta una frase
vacía con start/end por defecto basados en el currentTime actual, lista
para editar (US-019/US-030).\
UC-02 Eliminar: el profesor hace clic en el ícono de papelera de una
fila; la frase se quita de phrases (inmutable con filter).\
UC-03 Tras agregar o eliminar, phrases se reordena por start y los
índices se recalculan.

**Reglas**

- Eliminar la frase activa mueve curIdx a la frase anterior más cercana,
  o a -1 si no quedan frases.

- La acción de eliminar pide una confirmación breve inline para evitar
  borrados accidentales.

#### **US-033 — Seleccionar y deseleccionar todas las frases**

COMO profesor\
QUIERO marcar o desmarcar todas las frases de una sola vez\
PARA armar o limpiar mi secuencia de práctica rápido

**Casos de uso**

UC-01 El profesor hace clic en "Todas ✓": cada frase pasa a sel: true.\
UC-02 El profesor hace clic en "Ninguna": cada frase pasa a sel: false.\
UC-03 El contador "N sel." (US-017) y los tick marks (US-008) se
actualizan reactivamente.

**Reglas**

- Las acciones operan sobre phrases completo, no sobre showPhrases
  filtrado.

- "Ninguna" no afecta el filtro activo (US-018); si el filtro es 'sel',
  la lista pasa a mostrar "Sin frases".

### **Bloque 12 — Carga, robustez y compartición**

#### **US-034 — Cargar un SRT sobre un video ya abierto**

COMO profesor\
QUIERO agregar o reemplazar el SRT de un video que ya está cargado en el
player\
PARA usar mis subtítulos corregidos sin volver a la pantalla de carga

**Casos de uso**

UC-01 En el player, el profesor hace clic en "Cargar SRT" y selecciona
un archivo .srt/.vtt.\
UC-02 El archivo se lee con FileReader.readAsText(file, 'UTF-8') y se
procesa con parseSRT (US-002).\
UC-03 Si el parseo produce frases, reemplazan las actuales; si devuelve
0, se muestra "El SRT no tiene subtítulos válidos." y no se cambia nada.

**Reglas**

- Reemplazar el SRT descarta selección y ediciones de la sesión actual;
  si hay cambios sin guardar, se aplica la confirmación de US-025.

- El video en reproducción no se interrumpe durante la carga del SRT.

#### **US-035 — Salto directo desde el tick de la barra de progreso**

COMO profesor\
QUIERO hacer clic en el marcador de una frase en la barra de progreso
para saltar a ella\
PARA navegar visualmente sin usar la lista ni los botones

**Casos de uso**

UC-01 El profesor hace clic sobre un tick mark de frase en la pista de
progreso (US-008): se llama a jumpTo(idx) de esa frase en lugar de
scrub(e).\
UC-02 El tick clickeado pasa a ser la frase activa y la lista hace
scroll a ella (US-011).

**Reglas**

- El click sobre un tick tiene prioridad sobre el scrubbing: si el click
  cae dentro del ancho del tick (con una zona táctil ampliada), se
  interpreta como salto a frase.

- Fuera de los ticks, el click sigue funcionando como scrubbing
  proporcional (US-008).

#### **US-036 — Validación de tamaño y duración antes de subir**

COMO profesor\
QUIERO recibir un aviso si el video es demasiado grande o largo antes de
iniciar la transcripción\
PARA evitar esperas inútiles y errores de timeout

**Casos de uso**

UC-01 Tras detectar un video válido (US-001), se evalúa file.size contra
un umbral configurado.\
UC-02 Si supera el umbral, se muestra un aviso con el tamaño detectado y
la recomendación de recortar o usar un SRT propio (US-002), pero se
permite continuar.\
UC-03 Si la duración leída del metadata supera el margen seguro de
procesamiento, se advierte sobre el límite de maxDuration de la ruta de
transcripción (US-003).

**Reglas**

- La validación es informativa, no bloqueante: el profesor decide si
  igual sube.

- El umbral de tamaño y el de duración son constantes configurables en
  un único lugar.

#### **US-037 — Stage en ventana independiente para segundo monitor**

COMO profesor\
QUIERO abrir la zona del video y los subtítulos en una ventana
totalmente separada del panel de comando\
PARA arrastrarla a un segundo monitor y compartir SOLO esa ventana en
Zoom, sin que el alumno vea nunca los controles ni el backend

**Casos de uso**

UC-01 El profesor hace clic en "Abrir stage": se abre una ventana nueva
(window.open) que contiene exclusivamente el video y el overlay de
subtítulos (US-014), sin ningún control.\
UC-02 El panel de comando permanece en la ventana original; toda la
operación (play/pause, navegación, velocidad, delay, selección) se sigue
haciendo desde ahí.\
UC-03 El profesor arrastra la ventana del stage al segundo monitor y la
comparte en Zoom como "ventana", no como pantalla.\
UC-04 La ventana del stage refleja en tiempo real el frame del video, el
estado de reproducción y el subtítulo actual comandados desde el panel.\
UC-05 Si el navegador bloquea el popup, se ofrece como alternativa la
pantalla completa del stage dentro de la misma ventana (Fullscreen API).

**Reglas**

- La ventana del stage no contiene ningún elemento de control, panel,
  hint de Zoom, ni indicador de backend: es una superficie limpia de
  solo video + subtítulos.

- El profesor comparte en Zoom la ventana del stage, por lo que es
  físicamente imposible que el alumno vea el panel de comando.

- El cierre de la ventana del stage no detiene la sesión del panel; se
  puede reabrir sin perder estado.

- Este modo es la realización plena del objetivo de US-022 (que en main
  es solo un layout de dos columnas en una sola pantalla).

**Estados**

- stage embebido: video y panel en la misma ventana (comportamiento
  actual, US-022).

- stage independiente: video en ventana/monitor aparte; panel en la
  ventana original.

#### **US-038 — Sincronización panel ↔ stage en tiempo real**

COMO profesor\
QUIERO que la ventana del stage siga exactamente lo que comando desde el
panel sin demora perceptible\
PARA que el alumno vea el video y los subtítulos en perfecta
correspondencia con mis controles

**Casos de uso**

UC-01 Al abrir el stage (US-037), se establece un canal de comunicación
entre panel y stage (referencia a la ventana hija y/o
BroadcastChannel).\
UC-02 Cada acción del panel —play/pause (US-006), skip (US-007), scrub
(US-008), velocidad (US-009), navegación de frases (US-011),
repetir/micro-rep (US-012/US-013), delay (US-016), toggle CC (US-015)—
se propaga al stage de inmediato.\
UC-03 El video del stage es el elemento que se reproduce; el panel actúa
como control remoto sobre ese elemento.\
UC-04 El subtítulo actual (subText, subVisible, ccOn) y su highlight
(US-014) se renderizan en el stage usando el mismo loop de
sincronización.

**Reglas**

- El stage es la fuente de reproducción real; el panel no reproduce su
  propio video en paralelo para evitar doble audio y desincronización.

- La fuente del video (videoUrl/blob) debe ser accesible desde la
  ventana del stage; se resuelve pasando la referencia del objeto o
  re-creando el blob URL en el contexto del stage.

- La comunicación es unidireccional panel → stage para los comandos, con
  un canal de retorno mínimo stage → panel para el currentTime
  (necesario para la barra de progreso y la frase activa del panel).

#### **US-039 — Continuidad de estado al abrir o cerrar el stage**

COMO profesor\
QUIERO abrir o cerrar la ventana del stage en cualquier momento sin
perder mi sesión\
PARA reacomodar mi setup de monitores en medio de la clase sin
interrumpir la preparación

**Casos de uso**

UC-01 Al abrir el stage con el video ya en reproducción, el stage retoma
desde el currentTime actual y el mismo estado de play/pause.\
UC-02 Al cerrar la ventana del stage, la reproducción vuelve a la
ventana del panel (modo embebido) conservando currentTime, frases,
selección, delay y velocidad.\
UC-03 El cambio entre modo embebido y stage independiente no recarga el
video ni reinicia la transcripción.

**Reglas**

- El estado de sesión (US-023) es la fuente de verdad y sobrevive a la
  apertura/cierre del stage.

- Si el alumno ya estaba viendo la ventana compartida, cerrar el stage
  por accidente no expone el panel en Zoom: solo desaparece la ventana
  compartida.

### **Bloque 13 — Biblioteca de videos**

#### **US-040 — Inicio de sesión**

COMO profesor\
QUIERO iniciar sesión con mi cuenta de Google\
PARA que mi biblioteca de videos sea mía y esté accesible desde
cualquier dispositivo

**Casos de uso**

UC-01 El profesor hace clic en "Iniciar sesión" en la pantalla de carga:
se llama a signIn('google') de Auth.js.\
UC-02 Tras autenticarse, la sesión se guarda del lado del servidor
(estrategia 'database') y authStatus pasa a 'authenticated'.\
UC-03 Al detectar authStatus === 'authenticated', la app navega
automáticamente a la pantalla 'library' y llama a fetchLibrary().\
UC-04 El profesor hace clic en "Salir": se llama a signOut() y la sesión
de servidor se invalida.

**Reglas**

- **[Corregida 2026-09-03]** El modo sin cuenta ya **no** está
  disponible. Lo especificado originalmente ("arrastrar video directo,
  US-001, sin iniciar sesión") fue reemplazado por un **gate de login
  obligatorio**: con `authStatus !== 'authenticated'` la app solo
  renderiza la pantalla de bienvenida con el botón de Google
  (`app/page.tsx:1014-1031`); el dropzone existe únicamente autenticado
  (`app/page.tsx:1033`). Ver US-047 y SCR-025. (Nota de código: el
  ternario `app/page.tsx:1045-1047` "Iniciar sesión" quedó como código
  muerto — su rama nunca renderiza.)

- El proveedor de autenticación es exclusivamente Google (Auth.js /
  NextAuth v5); no hay registro con email y contraseña.

- La sesión del servidor usa estrategia 'database', respaldada por las
  tablas de Auth.js (user, account, session) en Postgres.

#### **US-041 — Ver mi biblioteca**

COMO profesor\
QUIERO ver la lista de mis videos guardados con nombre, cantidad de
frases y estado\
PARA elegir cuál retomar sin tener que recordarlo de memoria

**Casos de uso**

UC-01 Al entrar a la pantalla 'library', fetchLibrary() llama a GET
/api/videos y guarda el resultado en libraryVideos.\
UC-02 Cada fila muestra el nombre original del video, la cantidad de
frases guardadas (phraseCount) y, si corresponde, la etiqueta
"expirado".\
UC-03 Si la biblioteca está vacía, se muestra el mensaje "Todavía no
guardaste ningún video."\
UC-04 El botón "+ Subir nuevo video" navega a la pantalla 'load' sin
cerrar la sesión.

**Reglas**

- La lista solo incluye videos del usuario autenticado (filtrado por
  user_id en el servidor).

- El orden es por fecha de creación descendente (más reciente primero).

- Un error de red al cargar la biblioteca muestra "No se pudo cargar la
  biblioteca." sin romper la pantalla.

#### **US-042 — Guardar un video en la biblioteca**

COMO profesor\
QUIERO guardar explícitamente el video actual, con su SRT y ediciones,
en mi biblioteca\
PARA no perderlo ni tener que volver a subirlo la próxima clase

**Casos de uso**

UC-01 El profesor hace clic en "📚 Guardar en biblioteca" en el topbar
del player: se llama a saveToLibrary().\
UC-02 Se crea primero la fila de metadata vía POST /api/videos (nombre,
tamaño, tipo MIME); si la cuota está agotada, el servidor responde 413 y
se muestra el mensaje de error sin subir el archivo.\
UC-03 El archivo se sube directo a Vercel Blob desde el navegador
(upload() de @vercel/blob/client), sin pasar por el body de una función
serverless.\
UC-04 Al completarse la subida, el cliente confirma el storageUrl vía
PATCH /api/videos/\[id\] y guarda las frases/config actuales vía PUT
/api/videos/\[id\]/session.\
UC-05 Una vez guardado, el botón desaparece del topbar y el autoguardado
(US-023) pasa a apuntar a la base de datos en lugar de localStorage.

**Reglas**

- El guardado es una acción explícita, no automática: transcripciones
  descartadas o fallidas nunca llegan a ocupar espacio de la biblioteca.

- El botón solo está visible si hay sesión iniciada, el video no fue
  abierto ya desde la biblioteca, y hay un archivo de video en memoria.

- Mientras se guarda, el botón muestra "Guardando..." y queda
  deshabilitado para evitar duplicar la operación.

#### **US-043 — Reabrir un video de la biblioteca**

COMO profesor\
QUIERO abrir un video guardado y que cargue directo en el player con mis
frases, selección, delay y velocidad tal como quedaron\
PARA seguir editando o dar la clase donde la dejé, sin rehacer nada

**Casos de uso**

UC-01 El profesor hace clic en "Abrir" sobre una fila de la biblioteca:
se llama a openFromLibrary(id).\
UC-02 Se pide GET /api/videos/\[id\]; si el video está en estado
'ready', el player carga videoUrl desde storageUrl y las
frases/delay/speedIdx/ccOn/filter desde la sesión guardada.\
UC-03 Si el video está expirado o no tiene storageUrl, se muestra "Este
video expiró — subilo de nuevo para reproducirlo." y no se navega al
player.\
UC-04 A partir de este punto, el video queda identificado por
libraryVideoIdRef, que redirige el autoguardado (US-023) hacia la base
de datos.

**Reglas**

- No se ofrece el diálogo de restaurar sesión de US-024: al venir de la
  biblioteca, la sesión guardada es la única fuente de verdad, sin
  heurística de nombre+tamaño.

- Abrir un video de la biblioteca no descarga el SRT automáticamente (a
  diferencia de la transcripción nueva, US-005); el profesor puede
  exportarlo con el botón existente "↓ SRT".

#### **US-044 — Edición persistente de captions**

COMO profesor\
QUIERO que mis correcciones de texto, timestamps, selección y
configuración en un video de la biblioteca se guarden solas\
PARA no perder correcciones si cierro la pestaña sin acordarme de
exportar el SRT

**Casos de uso**

UC-01 El mismo efecto de autoguardado con debounce (~500 ms) de US-023
sigue disparándose ante cambios en phrases, delay, speedIdx, ccOn o
filter.\
UC-02 Si libraryVideoIdRef.current tiene un id, el destino del guardado
es PUT /api/videos/\[id\]/session en lugar de localStorage.\
UC-03 Si la llamada de red falla, el guardado se ignora silenciosamente
(best-effort, igual que el guardado en localStorage de US-023) y se
reintenta en el próximo cambio.

**Reglas**

- El shape de los datos guardados es el mismo SessionData que ya existía
  para localStorage (phrases, delay, speedIdx, ccOn, filter), más
  srtSource.

- Un video sin guardar en biblioteca (libraryVideoIdRef.current ===
  null) sigue autoguardándose en localStorage exactamente como antes —
  el modo invitado no se rompe.

#### **US-045 — Eliminar un video de la biblioteca**

COMO profesor\
QUIERO borrar un video que ya no uso\
PARA liberar espacio de mi cuota

**Casos de uso**

UC-01 El profesor hace clic en "Eliminar" sobre una fila de la
biblioteca: se llama a deleteFromLibrary(id).\
UC-02 El servidor verifica que el video pertenezca al usuario
autenticado, borra el archivo de Vercel Blob (best-effort) y elimina la
fila de la base de datos (con cascada sobre video_sessions).\
UC-03 La fila desaparece de la lista inmediatamente tras la confirmación
del servidor.

**Reglas**

- Un usuario nunca puede borrar el video de otro (ownership verificado
  por user_id en el servidor, no solo en el cliente).

- Si el borrado del blob falla (archivo ya no existe, error de red), la
  fila igual se elimina de la base de datos — el borrado es best-effort
  sobre el storage pesado.

#### **US-046 — Cuota de almacenamiento y expiración del video pesado**

COMO profesor\
QUIERO un límite claro de espacio y que, si mi video más viejo expira,
no pierda mi trabajo de corrección de subtítulos\
PARA seguir teniendo valor de mis clases anteriores aunque ya no pueda
reproducirlas

**Casos de uso**

UC-01 Antes de emitir el token de subida a Blob, el servidor suma el
tamaño de todos los videos 'ready' del usuario y lo compara contra
QUOTA_BYTES (8 GB); si se supera, la subida se rechaza con un mensaje
claro.\
UC-02 Un proceso programado (fuera de alcance de esta iteración) marca
como 'expired' los videos con más de VIDEO_RETENTION_DAYS (90) días,
borra el archivo pesado de Blob y conserva la fila de video_sessions
(frases, SRT, configuración) intacta.\
UC-03 La biblioteca muestra los videos expirados con la etiqueta
"expirado" y el botón "Abrir" deshabilitado, pero el SRT sigue siendo
exportable desde las frases guardadas.

**Reglas**

- La cuota es dura (8 GB por usuario) y se valida en el servidor antes
  de emitir el token de subida, nunca solo en el cliente.

- Expirar el video no borra nunca las frases/SRT/configuración — solo el
  archivo pesado en Blob.

- QUOTA_BYTES y VIDEO_RETENTION_DAYS son constantes centralizadas en
  lib/library.ts.

- **[Verificado 2026-09-03]** La cuota de 8 GB **sí** se aplica en
  servidor: `app/api/videos/route.ts:40` responde 413 al superarla, con
  re-chequeo en `app/api/blob-upload/route.ts:26`
  (`QUOTA_BYTES`/`getUsedBytes` en `lib/library.ts:5,12`). La expiración
  sigue **sin implementar**, consistente con lo que UC-02 declara "fuera
  de alcance": `VIDEO_RETENTION_DAYS = 90` está definido
  (`lib/library.ts:6`) pero no se usa en ningún lado, y nada transiciona
  un video a `status='expired'` (sin cron ni chequeo lazy). El modelo de
  datos, la UI (`app/page.tsx:1150,1152`) y el evento
  `library_video_open_blocked_expired` ya contemplan el estado expirado.

**Estados**

- status = 'uploading': fila creada, archivo aún subiéndose a Blob.

- status = 'ready': archivo disponible en Blob, video reproducible desde
  la biblioteca.

- status = 'expired': archivo pesado borrado por retención; frases/SRT
  siguen disponibles para exportar.

### **Bloque 14 — VE Drills (generador de ejercicios)**

*Agregado 2026-09-03 por auditoría. El código etiqueta este trabajo como
"Bloque 14" (`app/api/exercises/route.ts:1`, `lib/exercises.ts:1`). Motor
de ejercicios a partir de la transcripción, generado con Anthropic Claude
(`claude-sonnet-4-6`, `app/api/exercises/route.ts:90`), no Gemini.*

#### **US-048 — Generar ejercicios desde la transcripción**

COMO profesor\
QUIERO generar ejercicios (quiz, fill-in y match) a partir de las frases
del video\
PARA darle práctica autónoma al alumno sobre el material de la clase

**Casos de uso**

UC-01 El profesor abre la pestaña "Ejercicios" y hace clic en "GENERAR
EJERCICIOS": se llama a `generate()` (`app/ExercisesPanel.tsx:63`), que
hace `POST /api/exercises`.\
UC-02 El servidor arma el prompt según el modo (`buildPrompt`) y pide a
Claude una respuesta estructurada vía tool-use `build_exercises`
(`app/api/exercises/route.ts`).\
UC-03 La respuesta se valida con `validateSet` (quiz de 5, cloze de 6 con
`___`, match de 6); si es malformada, responde 502.\
UC-04 El panel muestra los tres tipos de ejercicio en sub-pestañas.

**Reglas**

- El modelo es Anthropic `claude-sonnet-4-6`; la API key es
  `ANTHROPIC_API_KEY` (`app/api/exercises/route.ts:68`). `maxDuration =
  60`.

- El alcance de frases se resuelve con `resolveScope`
  (`lib/exercises.ts:31`): 'sel' usa solo seleccionadas, con fallback a
  todas si no hay ninguna.

#### **US-049 — Pestaña de ejercicios en el player**

COMO profesor\
QUIERO una pestaña "Ejercicios" junto a "Player" dentro de la pantalla de
reproducción\
PARA armar la práctica sin salir del video

**Casos de uso**

UC-01 El header del panel derecho alterna "PLAYER" / "EJERCICIOS"
(`app/page.tsx:1218-1242`) vía el estado `panelTab`.\
UC-02 En modo "EJERCICIOS" se renderiza `ExercisesPanel` con
`singleMode="video"` (fuerza modo video y muestra el selector de scope).\
UC-03 Si el generador ya está abierto en otra ventana (US-055), la
pestaña muestra el hint "El generador está abierto en otra ventana".

**Reglas**

- La pestaña de ejercicios embebida y la ventana autónoma (US-055) son
  mutuamente excluyentes para las mismas frases.

#### **US-050 — Resolver ejercicios interactivos**

COMO alumno\
QUIERO responder el quiz, completar los fill-in y emparejar los match en
pantalla\
PARA autoevaluarme sobre el vocabulario y las frases del video

**Casos de uso**

UC-01 En el quiz, al elegir una opción se marca correcto/incorrecto
(`app/ExercisesPanel.tsx:188`).\
UC-02 En fill-in, al enviar una respuesta se compara contra el valor
esperado (`app/ExercisesPanel.tsx:196`).\
UC-03 En match, al clickear una definición se intenta emparejar con el
término seleccionado (`app/ExercisesPanel.tsx:208`); al completar el
último par se marca el ejercicio terminado
(`app/ExercisesPanel.tsx:215`).

**Reglas**

- La corrección es en el cliente contra la respuesta que devolvió el
  modelo; no hay round-trip por respuesta.

### **Bloque 15 — Generación avanzada y export a PDF**

*Agregado 2026-09-03 por auditoría. El código etiqueta este trabajo como
"Bloque 15" (`app/ExercisesPanel.tsx:1`, `lib/pdf.ts:1`).*

#### **US-051 — Generación por modo: video, tópico o ambos**

COMO profesor\
QUIERO elegir si los ejercicios salen del video, de un tópico libre o de
ambos\
PARA armar práctica incluso sin un video cargado

**Casos de uso**

UC-01 El selector "Video / Tópico / Ambos" (`app/ExercisesPanel.tsx:232`)
cambia `mode` vía `handleModeChange`; se oculta si el panel corre con
`singleMode`.\
UC-02 Con `mode !== 'video'` aparece un input de tópico
(`app/ExercisesPanel.tsx:254`, placeholder "Topic (e.g. Second World
War)").\
UC-03 `generate()` envía `phrases=[]` si el modo es 'topic', y el texto
del tópico si el modo no es 'video'.

**Reglas**

- El botón "GENERAR" queda deshabilitado si el modo requiere tópico y el
  campo está vacío (`generateDisabled`, `app/ExercisesPanel.tsx:60`).

#### **US-052 — Exportar ejercicios a PDF (alumno / profesor)**

COMO profesor\
QUIERO descargar los ejercicios en PDF, en versión para el alumno y/o con
respuestas para mí\
PARA repartirlos impresos o por archivo sin depender de la pantalla

**Casos de uso**

UC-01 El panel de PDF (`app/ExercisesPanel.tsx:381`) ofrece checkboxes de
tipo (quiz/cloze/match) y radios de versión (Alumno / Profesor / Ambas).\
UC-02 "DESCARGAR" llama a `downloadPdf()` (`app/ExercisesPanel.tsx`), que
carga `jspdf` dinámicamente y arma el contenido con las funciones puras
`buildStudentContent` / `buildTeacherContent` (`lib/pdf.ts:10,45`).\
UC-03 La versión alumno omite respuestas; la versión profesor marca la
correcta y agrega la explicación / el valor del blank.

**Reglas**

- Si la versión elegida es "Ambas" se generan dos PDFs.

#### **US-053 — Sección de ejercicios independiente (sin video)**

COMO profesor\
QUIERO armar ejercicios por tópico desde la pantalla de inicio, sin
cargar ningún video\
PARA preparar material aunque no tenga (todavía) el video de la clase

**Casos de uso**

UC-01 En la pantalla de carga, "Armar ejercicios" hace
`setScreen('exercises')` y dispara `exercises_section_opened`
(`app/page.tsx:1036-1039`).\
UC-02 La pantalla `screen === 'exercises'` (`app/page.tsx:1124-1134`)
renderiza `ExercisesPanel` con `phrases=[]` y `singleMode="topic"`.

**Reglas**

- En modo topic-only no se muestra el selector de scope (no hay frases de
  video que filtrar).

#### **US-054 — Nivel, alcance y regeneración**

COMO profesor\
QUIERO elegir el nivel (beginner/intermediate/advanced) y el alcance de
frases, y poder regenerar\
PARA ajustar la dificultad y el foco de la práctica

**Casos de uso**

UC-01 Los selectores de `level` y `scope` (`lib/exercises.ts:4-5`)
alimentan `generate()` y viajan en el evento
`exercises_generation_started`.\
UC-02 "↺ REGENERAR" vuelve a llamar a `generate()` con los mismos
parámetros.

**Reglas**

- `scope` solo aplica cuando el modo incluye video; en topic-only se
  ignora.

### **Bloque 16 — Ventana autónoma de ejercicios**

*Agregado 2026-09-03 por auditoría. El código etiqueta este trabajo como
"Bloque 16" y ya reserva el ID **US-055**
(`app/exercises-window/page.tsx:2`, `lib/exercisesChannel.ts:1`,
`app/page.tsx:556`).*

#### **US-055 — Generador de ejercicios en ventana independiente**

COMO profesor\
QUIERO abrir el generador de ejercicios en una ventana aparte que siga
funcionando aunque cierre el player\
PARA proyectar o trabajar los ejercicios en un segundo monitor / pestaña

**Casos de uso**

UC-01 "⊞ Abrir generador" llama a `openExercisesWindow()`
(`app/page.tsx:556-576`): abre `window.open('/exercises-window')` y envía
las frases + nivel + scope por `BroadcastChannel 've-exercises-v1'`
(`lib/exercisesChannel.ts`).\
UC-02 La ventana (`app/exercises-window/page.tsx`) responde `ready`,
recibe `load_phrases` una sola vez y a partir de ahí es autónoma: renderiza
`ExercisesPanel` con `singleMode="video"`.\
UC-03 Al cerrar la ventana se emite `closed`; "✕ Cerrar generador"
(`closeExercisesWindow`, `app/page.tsx:578-588`) cierra el canal.

**Reglas**

- El botón queda deshabilitado si no hay frases (`phrases.length === 0`).

- El canal `ve-exercises-v1` es independiente del canal `ve-stage-v1` del
  stage (US-037).

### **Bloque 17 — Rediseño de bienvenida y gate de acceso**

*Agregado 2026-09-03 por auditoría. Corresponde al commit más reciente
("rediseño visual pantalla de bienvenida + gate de login obligatorio").
Numéricamente US-047 va con este bloque aunque cronológicamente sea
posterior a US-055.*

#### **US-047 — Gate de login obligatorio y pantalla de bienvenida**

COMO producto\
QUIERO exigir inicio de sesión con Google antes de usar la app y mostrar
una bienvenida de marca\
PARA que toda actividad quede asociada a una cuenta y unificar la
identidad visual

**Casos de uso**

UC-01 Con `authStatus !== 'authenticated'`, la app renderiza solo la
pantalla de bienvenida (`app/page.tsx:1014-1031`): wordmark "Virtual
English", isotipo "VE" y botón "Iniciar sesión con Google"
(`signIn('google')`).\
UC-02 Recién autenticado, se habilita la pantalla de carga con el dropzone
y el topbar ("Armar ejercicios", "📚 Mi biblioteca", "Salir")
(`app/page.tsx:1033-1048`).\
UC-03 No existe camino de invitado: sin sesión no hay dropzone (enmienda
a la regla de US-040).

**Reglas**

- El rediseño incorpora las fuentes Fraunces, Public Sans y JetBrains
  Mono (`app/layout.tsx`); `app/providers.tsx` envuelve la app con
  `SessionProvider` de NextAuth.

- El ternario "Iniciar sesión" de `app/page.tsx:1045-1047` es código
  muerto (rama inalcanzable): la pantalla de carga ya exige sesión.

### **Bloque 18 — Salto por sección dentro de la frase**

*Agregado 2026-09-03. Reemplaza la micro-repetición (US-013) por una grilla
de secciones de duración fija, navegable con la tecla ↑.*

#### **US-056 — Salto al inicio de la sección con ↑**

COMO profesor\
QUIERO volver al inicio de la sección actual dentro de la frase con la
tecla ↑\
PARA que el alumno reescuche un tramo corto y parejo sin reiniciar toda la
frase ni retroceder un valor fijo de segundos

**Casos de uso**

UC-01 El profesor presiona ↑ (sin input enfocado): se llama a
`sectionJump()` (`app/page.tsx`).\
UC-02 La frase se subdivide en secciones de duración fija desde
`phrase.start`, cada una de `SECTION_SECONDS` (por defecto 2 s). El destino
es el inicio de la sección que contiene el `currentTime` actual:
`section_start = phrase.start + Math.floor((currentTime - phrase.start) / SECTION_SECONDS) * SECTION_SECONDS`,
acotado a `[phrase.start, phrase.end]`.\
UC-03 Si el `currentTime` ya está en el primer tramo, ↑ vuelve a
`phrase.start`.\
UC-04 Con el stage abierto, el salto se envía como `seek` por el canal
(igual que la navegación de frases), usando `lastStageTimeRef` como tiempo
base.

**Reglas**

- La grilla es **automática y pareja** desde `phrase.start`; no hay marcas
  manuales.

- `SECTION_SECONDS` es una **constante configurable** declarada arriba de
  `app/page.tsx` (`const SECTION_SECONDS = 2`).

- `sectionJump()` es no-op si `curIdxRef.current < 0` o no hay frase
  activa, y no-op si un \<input\> está enfocado.

### **Enmiendas a reglas existentes**

**US-016 (Ajuste de delay de subtítulos):** se define un límite al
ajuste de delay, acotándolo a un rango de ±10 s, para evitar valores
absurdos. Antes el código no definía mínimo ni máximo.

**US-040 (Inicio de sesión) — [Corregida 2026-09-03]:** se eliminó el
modo invitado. El acceso ahora requiere login con Google (gate duro, ver
US-047). La regla original que permitía transcribir sin cuenta quedó
anotada en la propia US-040.

**US-046 (Cuota y expiración) — [Verificado 2026-09-03]:** la cuota de 8
GB se aplica en servidor; la expiración automática sigue sin implementar
(consistente con el "fuera de alcance" de su UC-02).
`VIDEO_RETENTION_DAYS` está definido pero no se usa.

**US-010/011/012/013 (Teclado del player) — [Corregida 2026-09-03]:** nuevo
esquema por flechas. →/← navegan (con barrido al mantener, `NAV_HOLD_MS`),
↓ reinicia la frase, ↑ salta a la sección (US-056). Se eliminaron A, D, R,
W, la micro-repetición completa (US-013) y el volumen por teclado (US-010,
queda el slider). Código en `app/page.tsx:238-267`; constantes
`SECTION_SECONDS` y `NAV_HOLD_MS`.

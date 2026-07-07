'use client'
import { useRef, useState, useEffect, useMemo } from 'react'
import styles from './page.module.css'
import { Phrase, parseSRT, fmtTime, timeToSec, secToTs, splitPhrase, mergePhrase } from '@/lib/srt'
import { hl } from '@/lib/hl'
import { capture } from '@/lib/capture'
import { StageChannel } from '@/lib/stageChannel'
import { sessionKey, saveSession, loadSession } from '@/lib/session'
import type { SessionData } from '@/lib/session'

type Step = 'idle' | 'uploading' | 'transcribing' | 'parsing' | 'done'

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5]

export default function Player() {
  // ─── DOM refs ────────────────────────────────────────────────────────────
  const vidRef  = useRef<HTMLVideoElement>(null)
  const progRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const xhrRef  = useRef<XMLHttpRequest | null>(null)

  // ─── Stage refs ──────────────────────────────────────────────────────────
  const videoFileRef          = useRef<File | null>(null)
  const panelVideoUrlRef      = useRef<string | null>(null)
  const channelRef            = useRef<StageChannel | null>(null)
  const channelUnsubRef       = useRef<(() => void) | null>(null)
  const stageOpenRef          = useRef(false)
  const stageStartRef         = useRef(0)
  const lastStageTimeRef      = useRef(0)
  const stageDurationRef      = useRef(0)
  const pendingRestoreTimeRef = useRef<number | null>(null)

  // ─── State ───────────────────────────────────────────────────────────────
  const [screen, setScreen]               = useState<'load' | 'player'>('load')
  const [step, setStep]                   = useState<Step>('idle')
  const [stepMsg, setStepMsg]             = useState('')
  const [progress, setProgress]           = useState(0)
  const [errorMsg, setErrorMsg]           = useState('')
  const [videoFileName, setVideoFileName] = useState('')
  const [videoUrl, setVideoUrl]           = useState('')
  const [srtSource, setSrtSource]         = useState('')
  const [phrases, setPhrases]             = useState<Phrase[]>([])
  const [curIdx, setCurIdx]               = useState(-1)
  const [ccOn, setCcOn]                   = useState(true)
  const [delay, setDelay]                 = useState(0)
  const [speedIdx, setSpeedIdx]           = useState(2)
  const [filter, setFilter]               = useState<'all' | 'sel'>('all')
  const [subText, setSubText]             = useState('')
  const subTextNodes = useMemo(() => hl(subText), [subText])
  const [subVisible, setSubVisible]       = useState(false)
  const [editingIdx, setEditingIdx]       = useState<number | null>(null)
  const [editingText, setEditingText]     = useState('')
  const [editingStartTs, setEditingStartTs] = useState('')
  const [editingEndTs,   setEditingEndTs]   = useState('')
  const [editingError,   setEditingError]   = useState('')
  const [timeCur, setTimeCur]             = useState('0:00')
  const [timeTot, setTimeTot]             = useState('0:00')
  const [progPct, setProgPct]             = useState(0)
  const [bufPct, setBufPct]               = useState(0)
  const [isPlaying, setIsPlaying]         = useState(false)
  const [vol, setVol]                     = useState(100)
  const [stageOpen, setStageOpen]         = useState(false)
  // US-023/024/025 persistence state
  const [isDirty, setIsDirty]             = useState(false)
  const [restorePrompt, setRestorePrompt] = useState<SessionData | null>(null)
  const [exitDialog, setExitDialog]       = useState(false)
  const [autoPause, setAutoPause]         = useState(false)
  const [practiceMode, setPracticeMode]   = useState(false)
  const [loopMode, setLoopMode]           = useState(false)
  const [hideTexts, setHideTexts]         = useState(false)

  // ─── Hot refs ─────────────────────────────────────────────────────────────
  const phrasesRef   = useRef<Phrase[]>([])
  const curIdxRef    = useRef(-1)
  const ccRef        = useRef(true)
  const delayRef     = useRef(0)
  const isPlayingRef    = useRef(false)
  const autoPauseRef    = useRef(false)
  const autoPausedAtRef = useRef(-1)
  const practiceModeRef = useRef(false)
  const practicedAtRef  = useRef(-1)
  const loopModeRef     = useRef(false)
  const loopedAtRef     = useRef(-1)

  useEffect(() => {
    phrasesRef.current = phrases
    const v = vidRef.current
    if (v && v.currentTime > 0 && phrases.length > 0) {
      const t = v.currentTime - delayRef.current
      const ph = phrases.find(p => t >= p.start && t <= p.end)
      if (ph && ccRef.current) { setSubText(ph.text); setSubVisible(true) }
    }
  }, [phrases])
  useEffect(() => {
    curIdxRef.current       = curIdx
    autoPausedAtRef.current = -1
    practicedAtRef.current  = -1
  }, [curIdx])
  useEffect(() => { ccRef.current       = ccOn      }, [ccOn])
  useEffect(() => { delayRef.current    = delay     }, [delay])
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { autoPauseRef.current    = autoPause    }, [autoPause])
  useEffect(() => { practiceModeRef.current = practiceMode }, [practiceMode])
  useEffect(() => { loopModeRef.current     = loopMode     }, [loopMode])

  // ─── US-023: autosave con debounce 500 ms ────────────────────────────────
  // Dirty policy: texto, sel, delay (incl. reset), velocidad, ccOn.
  // `filter` es preferencia de vista: persiste en sesión pero no marca dirty.
  useEffect(() => {
    if (screen !== 'player' || !videoFileName || phrases.length === 0 || restorePrompt !== null) return
    const size = videoFileRef.current?.size ?? 0
    const key  = sessionKey(videoFileName, size)
    const tid  = setTimeout(() => {
      saveSession(key, { phrases, delay, speedIdx, ccOn, filter })
      capture('session_autosaved', {
        video_file_name: videoFileName,
        phrase_count:    phrases.length,
        selected_count:  phrases.filter(p => p.sel).length,
      })
    }, 500)
    return () => clearTimeout(tid)
  }, [phrases, delay, speedIdx, ccOn, filter, screen, videoFileName, restorePrompt])

  // ─── Local video event listeners ─────────────────────────────────────────
  useEffect(() => {
    const v = vidRef.current; if (!v) return
    const onMeta = () => {
      setTimeTot(fmtTime(v.duration))
      if (pendingRestoreTimeRef.current !== null) {
        v.currentTime = pendingRestoreTimeRef.current
        pendingRestoreTimeRef.current = null
      }
    }
    const onEnded = () => { setIsPlaying(false); setSubText('') }
    const onProg  = () => {
      try { if (v.buffered.length > 0) setBufPct(v.buffered.end(v.buffered.length - 1) / v.duration * 100) } catch {}
    }
    const onTU = () => {
      if (!v.duration) return
      setProgPct(v.currentTime / v.duration * 100)
      setTimeCur(fmtTime(v.currentTime))
      const t  = v.currentTime - delayRef.current
      const ps = phrasesRef.current
      if (ps.length === 0) return
      const ph  = ps.find(p => t >= p.start && t <= p.end)
      if (ph && ccRef.current) { setSubText(ph.text); setSubVisible(true) }
      else { setSubVisible(false); setSubText('') }
      const idx = ps.findIndex(p => t >= p.start && t <= p.end)
      if (idx !== -1) {
        if (idx !== curIdxRef.current) setCurIdx(idx)
        loopedAtRef.current = -1
      }
      if (!stageOpenRef.current) handleEndOfPhrase(v.currentTime, !v.paused)
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate',     onTU)
    v.addEventListener('progress',       onProg)
    v.addEventListener('ended',          onEnded)
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('timeupdate',     onTU)
      v.removeEventListener('progress',       onProg)
      v.removeEventListener('ended',          onEnded)
    }
  }, [screen])

  // ─── RAF subtitle sync (local video; noop while stage open) ──────────────
  useEffect(() => {
    if (screen !== 'player') return
    let rafId: number
    const sync = () => {
      const v = vidRef.current
      if (v && !v.paused && phrasesRef.current.length > 0) {
        const t  = v.currentTime - delayRef.current
        const ph = phrasesRef.current.find(p => t >= p.start && t <= p.end)
        if (ph && ccRef.current) { setSubText(ph.text); setSubVisible(true) }
        else { setSubVisible(false); setSubText('') }
      }
      rafId = requestAnimationFrame(sync)
    }
    rafId = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(rafId)
  }, [screen])

  // ─── US-038: push subtitle to stage when phrase or CC toggle changes ──────
  // TODO: if the active phrase text is edited while stage is open, the edit
  // won't propagate until curIdx changes — handle this in the editing+stage session.
  useEffect(() => {
    if (!stageOpen) return
    const ch = channelRef.current; if (!ch) return
    const ph = phrasesRef.current[curIdx]
    ch.send({ type: 'subtitle', text: ph ? ph.text : '', visible: ccOn && !!ph })
  }, [curIdx, ccOn, stageOpen])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'player') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      switch (e.key) {
        case ' ':          e.preventDefault(); togglePlay();  break
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); prevPhrase();  break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); nextPhrase();  break
        case 'w': case 'W': e.preventDefault(); microRepeat(); break
        case 'r': case 'R': e.preventDefault(); repeatPhrase(); break
        case 'ArrowUp':   e.preventDefault(); if (vidRef.current) vidRef.current.volume = Math.min(1, vidRef.current.volume + 0.1); break
        case 'ArrowDown': e.preventDefault(); if (vidRef.current) vidRef.current.volume = Math.max(0, vidRef.current.volume - 0.1); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen])

  // ─── Scroll active phrase into view ──────────────────────────────────────
  useEffect(() => {
    if (listRef.current) {
      const act = listRef.current.querySelector('[data-act="true"]')
      if (act) act.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [curIdx])

  // ─── Playback ─────────────────────────────────────────────────────────────
  function togglePlay() {
    if (stageOpenRef.current) {
      const ch = channelRef.current; if (!ch) return
      if (isPlayingRef.current) { ch.send({ type: 'pause' }); setIsPlaying(false) }
      else                       { ch.send({ type: 'play'  }); setIsPlaying(true)  }
      return
    }
    const v = vidRef.current; if (!v) return
    if (v.paused) { v.play(); setIsPlaying(true) }
    else          { v.pause(); setIsPlaying(false) }
  }

  function skip(s: number) {
    if (stageOpenRef.current) {
      channelRef.current?.send({ type: 'seek', time: Math.max(0, lastStageTimeRef.current + s) })
      return
    }
    const v = vidRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s))
  }

  function scrub(e: React.MouseEvent) {
    const r   = progRef.current!.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    if (stageOpenRef.current) {
      channelRef.current?.send({ type: 'seek', time: pct * stageDurationRef.current })
      return
    }
    const v = vidRef.current; if (!v?.duration) return
    v.currentTime = pct * v.duration
  }

  function jumpTo(idx: number) {
    if (idx < 0 || idx >= phrasesRef.current.length) return
    setCurIdx(idx)
    const time = phrasesRef.current[idx].start + 0.05
    if (stageOpenRef.current) { channelRef.current?.send({ type: 'seek', time }); return }
    if (vidRef.current) vidRef.current.currentTime = time
  }

  function prevPhrase() {
    const ps = phrasesRef.current
    const cur = curIdxRef.current
    if (practiceModeRef.current) {
      const idx = [...ps].slice(0, cur).map((p, i) => ({ p, i })).filter(x => x.p.sel).pop()?.i ?? cur
      jumpTo(idx)
    } else {
      jumpTo(Math.max(0, cur - 1))
    }
  }
  function nextPhrase() {
    const ps = phrasesRef.current
    const cur = curIdxRef.current
    if (practiceModeRef.current) {
      const idx = ps.findIndex((p, i) => p.sel && i > cur)
      jumpTo(idx !== -1 ? idx : cur)
    } else {
      jumpTo(Math.min(ps.length - 1, cur + 1))
    }
  }

  function repeatPhrase() {
    if (curIdxRef.current < 0) return
    const time = phrasesRef.current[curIdxRef.current].start + 0.05
    if (stageOpenRef.current) { channelRef.current?.send({ type: 'seek', time }); return }
    if (vidRef.current) vidRef.current.currentTime = time
  }

  function microRepeat() {
    if (curIdxRef.current < 0) return
    const phraseStart = phrasesRef.current[curIdxRef.current]?.start ?? 0
    if (stageOpenRef.current) {
      channelRef.current?.send({ type: 'seek', time: Math.max(phraseStart, lastStageTimeRef.current - 2) })
      return
    }
    if (!vidRef.current) return
    vidRef.current.currentTime = Math.max(phraseStart, vidRef.current.currentTime - 2)
    setSubVisible(false); setTimeout(() => setSubVisible(true), 80)
  }

  function toggleSel(idx: number) {
    setIsDirty(true)
    setPhrases(prev => prev.map((p, i) => i === idx ? { ...p, sel: !p.sel } : p))
  }

  function setSpd(idx: number) {
    setIsDirty(true)
    setSpeedIdx(idx)
    if (stageOpenRef.current) { channelRef.current?.send({ type: 'speed', rate: SPEEDS[idx] }); return }
    if (vidRef.current) vidRef.current.playbackRate = SPEEDS[idx]
  }

  function adjDelay(d: number) {
    setDelay(prev => {
      const n = Math.max(-10, Math.min(10, Math.round((prev + d) * 10) / 10))
      delayRef.current = n
      return n
    })
    setIsDirty(true)
  }

  // Phrase-end dispatch: called from onTU (local) and stage timeupdate.
  // Precedence: loop > práctica > auto-pausa.
  function handleEndOfPhrase(ct: number, playing: boolean) {
    if (!playing) return
    const curI = curIdxRef.current
    if (curI < 0) return
    const ph = phrasesRef.current[curI]
    if (!ph || ct <= ph.end) return

    // 1. Loop: seek back to phrase start; práctica and auto-pausa do not fire.
    if (loopModeRef.current) {
      if (loopedAtRef.current === curI) return
      loopedAtRef.current = curI
      const seekTime = ph.start + 0.05
      if (stageOpenRef.current) channelRef.current?.send({ type: 'seek', time: seekTime })
      else if (vidRef.current) vidRef.current.currentTime = seekTime
      return
    }

    // 2. Práctica: advance to next selected phrase; pause at last selected.
    if (practiceModeRef.current && ph.sel) {
      if (practicedAtRef.current === curI) return
      practicedAtRef.current = curI
      const ps = phrasesRef.current
      const nextSelIdx = ps.findIndex((p, i) => p.sel && i > curI)
      if (nextSelIdx !== -1) {
        const seekTime = ps[nextSelIdx].start + 0.05
        if (stageOpenRef.current) channelRef.current?.send({ type: 'seek', time: seekTime })
        else if (vidRef.current) vidRef.current.currentTime = seekTime
      } else {
        if (stageOpenRef.current) channelRef.current?.send({ type: 'pause' })
        else { vidRef.current?.pause(); setIsPlaying(false) }
      }
      return
    }

    // 3. Auto-pausa: pause once per phrase entry.
    if (!autoPauseRef.current) return
    if (autoPausedAtRef.current === curI) return
    autoPausedAtRef.current = curI
    if (stageOpenRef.current) channelRef.current?.send({ type: 'pause' })
    else { vidRef.current?.pause(); setIsPlaying(false) }
  }

  // ─── US-024: restaurar / descartar sesión ────────────────────────────────
  function handleRestore(saved: SessionData) {
    setPhrases(saved.phrases)
    setDelay(saved.delay); delayRef.current = saved.delay
    setSpeedIdx(saved.speedIdx)
    if (vidRef.current) vidRef.current.playbackRate = SPEEDS[saved.speedIdx]
    setCcOn(saved.ccOn); ccRef.current = saved.ccOn
    setFilter(saved.filter)
    setRestorePrompt(null)
    setIsDirty(false)
    // Propagate speed to stage if open.
    // Subtitle propagation is handled by the subtitle useEffect (fires on ccOn change).
    if (stageOpenRef.current) channelRef.current?.send({ type: 'speed', rate: SPEEDS[saved.speedIdx] })
    capture('session_restore_resolved', { action: 'restore', video_file_name: videoFileName })
  }

  function handleDiscard() {
    setRestorePrompt(null)
    setIsDirty(false)
    capture('session_restore_resolved', { action: 'discard', video_file_name: videoFileName })
  }

  // ─── US-025: guardar o confirmar salida ──────────────────────────────────
  function handleExitAttempt() {
    if (isDirty) {
      setExitDialog(true)
      capture('exit_confirmation_shown', { has_edits: true, selected_count: selPhrases.length })
      return
    }
    backToLoad()
  }

  // ─── Stage management (US-037 / US-038 / US-039) ─────────────────────────
  function openStage() {
    if (!videoFileRef.current) return
    const v           = vidRef.current
    const currentTime  = v?.currentTime  ?? 0
    const playbackRate = v?.playbackRate ?? SPEEDS[speedIdx]

    if (v) { v.pause(); v.src = '' }
    setIsPlaying(false)

    const ch = new StageChannel()
    channelRef.current = ch

    const unsub = ch.onMessage(msg => {
      switch (msg.type) {
        case 'ready':
          ch.send({
            type:        'load_blob',
            blob:        videoFileRef.current!,
            fileName:    videoFileName,
            currentTime,
            playbackRate,
            ccOn:        ccRef.current,
          })
          break
        case 'timeupdate': {
          const { currentTime: ct, duration, isPlaying: playing } = msg
          lastStageTimeRef.current = ct
          stageDurationRef.current = duration
          if (duration) setProgPct(ct / duration * 100)
          setTimeCur(fmtTime(ct))
          setIsPlaying(playing)
          const t   = ct - delayRef.current
          const idx = phrasesRef.current.findIndex(p => t >= p.start && t <= p.end)
          if (idx !== -1) {
            if (idx !== curIdxRef.current) setCurIdx(idx)
            loopedAtRef.current = -1
          }
          handleEndOfPhrase(ct, playing)
          break
        }
        case 'closed':
          closeStage(false)
          break
      }
    })
    channelUnsubRef.current = unsub

    const win    = window.open('/stage', '_blank', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no')
    const method: 'window' | 'fullscreen' = win ? 'window' : 'fullscreen'
    if (!win) document.getElementById('ve-stage-wrap')?.requestFullscreen?.().catch(() => {})

    stageOpenRef.current = true
    setStageOpen(true)
    stageStartRef.current = Date.now()
    capture('stage_window_opened', { method })
  }

  function closeStage(sendClose = true) {
    const ch = channelRef.current
    if (ch) {
      if (sendClose) ch.send({ type: 'close' })
      channelUnsubRef.current?.()
      channelUnsubRef.current = null
      ch.close()
      channelRef.current = null
    }
    stageOpenRef.current = false
    setStageOpen(false)

    capture('stage_window_closed', { open_duration_s: Math.round((Date.now() - stageStartRef.current) / 1000) })

    pendingRestoreTimeRef.current = lastStageTimeRef.current

    if (videoFileRef.current) {
      if (panelVideoUrlRef.current) URL.revokeObjectURL(panelVideoUrlRef.current)
      const url = URL.createObjectURL(videoFileRef.current)
      panelVideoUrlRef.current = url
      setVideoUrl(url)
    }
  }

  // ─── File handling ────────────────────────────────────────────────────────
  function handleFiles(files: File[]) {
    let vf: File | null = null, sf: File | null = null  // eslint-disable-line
    files.forEach(f => {
      if (f.name.match(/\.(srt|vtt)$/i)) sf = f
      else if (f.type.startsWith('video/') || f.name.match(/\.(avi|mp4|mkv|mov|webm|m4v)$/i)) vf = f
    })
    if (!vf) { setErrorMsg('Arrastrá un archivo de video (MP4, AVI, MKV...)'); return }
    setErrorMsg('')
    setVideoFileName((vf as File).name)
    videoFileRef.current = vf
    if (panelVideoUrlRef.current) URL.revokeObjectURL(panelVideoUrlRef.current)
    const url = URL.createObjectURL(vf as File)
    panelVideoUrlRef.current = url
    setVideoUrl(url)
    const srtFile = sf as File | null
    if (srtFile) {
      const r = new FileReader()
      r.onload = e => {
        const parsed = parseSRT(e.target!.result as string)
        if (parsed.length === 0) { setErrorMsg('El SRT no tiene subtítulos válidos.'); return }
        // US-024: check for saved session before showing player
        const sessKey = sessionKey((vf as File).name, (vf as File).size)
        const savedSess = loadSession(sessKey)
        if (savedSess && savedSess.phrases.length === parsed.length) {
          setRestorePrompt(savedSess)
          capture('session_restore_prompted', { video_file_name: (vf as File).name, saved_phrase_count: savedSess.phrases.length })
        }
        setIsDirty(false)
        setPhrases(parsed); setSrtSource(`SRT · ${parsed.length} frases`)
        setScreen('player')
      }
      r.readAsText(srtFile, 'UTF-8')
    } else {
      transcribe(vf as File)
    }
  }

  async function transcribe(videoFile: File) {
    setStep('uploading'); setStepMsg('Iniciando subida...'); setProgress(3); setErrorMsg('')
    const mimeType = videoFile.type || 'video/mp4'

    let uploadUrl: string
    try {
      const initRes = await fetch('/api/upload-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType, size: videoFile.size }),
      })
      if (!initRes.ok) {
        const d = await initRes.json().catch(() => ({}))
        setErrorMsg(d.error || `Error al iniciar la subida: ${initRes.status}`)
        setStep('idle'); setProgress(0); return
      }
      const initData = await initRes.json()
      uploadUrl = initData.uploadUrl
    } catch {
      setErrorMsg('Error de red al iniciar la subida.')
      setStep('idle'); setProgress(0); return
    }

    setStepMsg(`Subiendo a Gemini (${(videoFile.size / 1024 / 1024).toFixed(0)} MB)...`)
    setProgress(5)

    let fileUri: string
    try {
      fileUri = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round(e.loaded / e.total * 100)
            setStepMsg(`Subiendo a Gemini — ${pct}%`)
            setProgress(5 + pct * 0.6)
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText)
              const uri = data.file?.uri
              if (!uri) { reject(new Error('Gemini no devolvió un file URI')); return }
              resolve(uri)
            } catch {
              reject(new Error('Error al procesar respuesta de Gemini'))
            }
          } else {
            reject(new Error(`Error al subir a Gemini: ${xhr.status}`))
          }
        }

        xhr.onerror = () => reject(new Error('Error de red al subir a Gemini.'))
        xhr.onabort = () => reject(new Error('cancelled'))

        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', mimeType)
        xhr.setRequestHeader('X-Goog-Upload-Offset', '0')
        xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize')
        xhr.send(videoFile)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de red'
      if (msg !== 'cancelled') {
        setErrorMsg(msg); setStep('idle'); setProgress(0)
      }
      return
    }

    setStep('transcribing')
    setStepMsg('Gemini transcribiendo el audio...')
    setProgress(65)

    let p = 65
    const interval = setInterval(() => {
      p = Math.min(p + Math.random() * 2, 95)
      setProgress(p)
      if (p >= 95) clearInterval(interval)
    }, 2000)

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUri, mimeType }),
      })
      clearInterval(interval)

      const data = await res.json()
      if (!res.ok || data.error) {
        setErrorMsg(data.error || `Error del servidor: ${res.status}`)
        setStep('idle'); setProgress(0); return
      }

      const parsed = parseSRT(data.srt)
      if (parsed.length === 0) {
        setErrorMsg('No se generaron subtítulos. El video puede no tener audio detectable.')
        setStep('idle'); setProgress(0); return
      }

      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([data.srt], { type: 'text/plain;charset=utf-8' }))
      a.download = videoFile.name.replace(/\.[^.]+$/, '') + '.srt'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)

      // US-024: check for saved session before showing player
      const sessKey = sessionKey(videoFile.name, videoFile.size)
      const savedSess = loadSession(sessKey)
      if (savedSess && savedSess.phrases.length === parsed.length) {
        setRestorePrompt(savedSess)
        capture('session_restore_prompted', { video_file_name: videoFile.name, saved_phrase_count: savedSess.phrases.length })
      }
      setIsDirty(false)
      setPhrases(parsed)
      setSrtSource(`Gemini AI · ${parsed.length} frases`)
      setProgress(100); setStep('done')
      setTimeout(() => setScreen('player'), 300)
    } catch {
      clearInterval(interval)
      setErrorMsg('Error de red al transcribir.')
      setStep('idle'); setProgress(0)
    }
  }

  function cancelTranscription() {
    if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null }
    setStep('idle'); setProgress(0); setErrorMsg('Cancelado.')
    if (panelVideoUrlRef.current) { URL.revokeObjectURL(panelVideoUrlRef.current); panelVideoUrlRef.current = null }
    setVideoUrl(''); setVideoFileName('')
    videoFileRef.current = null
  }

  function backToLoad() {
    if (stageOpenRef.current) closeStage(true)
    const v = vidRef.current; if (v) { v.pause(); v.src = '' }
    if (panelVideoUrlRef.current) { URL.revokeObjectURL(panelVideoUrlRef.current); panelVideoUrlRef.current = null }
    setScreen('load'); setStep('idle'); setProgress(0)
    setPhrases([]); setCurIdx(-1); setIsPlaying(false)
    setVideoUrl(''); setErrorMsg(''); setSrtSource('')
    setStageOpen(false); stageOpenRef.current = false
    videoFileRef.current = null
    setIsDirty(false); setRestorePrompt(null); setExitDialog(false)
  }

  function downloadSRT() {
    if (phrases.length === 0) return
    const lines: string[] = []
    phrases.forEach((p, i) => {
      const fmt = (s: number) => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
        const sc = Math.floor(s % 60), ms = Math.round((s % 1) * 1000)
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')},${String(ms).padStart(3, '0')}`
      }
      lines.push(`${i + 1}\n${fmt(p.start)} --> ${fmt(p.end)}\n${p.text}\n`)
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }))
    a.download = videoFileName.replace(/\.[^.]+$/, '') + '.srt'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  function startEdit(idx: number) {
    setEditingIdx(idx)
    setEditingText(phrases[idx].text)
    setEditingStartTs(secToTs(phrases[idx].start))
    setEditingEndTs(secToTs(phrases[idx].end))
    setEditingError('')
  }

  function saveEdit(idx: number) {
    const newStart = timeToSec(editingStartTs)
    const newEnd   = timeToSec(editingEndTs)
    if (isNaN(newStart) || isNaN(newEnd) || newStart < 0 || newEnd < 0) {
      setEditingError('formato inválido'); return
    }
    if (newStart >= newEnd) {
      setEditingError('inicio ≥ fin'); return
    }
    setIsDirty(true)
    setPhrases(prev => prev.map((p, i) =>
      i === idx ? { ...p, text: editingText, start: newStart, end: newEnd } : p))
    setEditingIdx(null)
    setEditingText('')
    setEditingStartTs('')
    setEditingEndTs('')
    setEditingError('')
    if (stageOpenRef.current && idx === curIdxRef.current)
      channelRef.current?.send({ type: 'subtitle', text: editingText, visible: ccRef.current })
  }

  function cancelEdit() {
    setEditingIdx(null)
    setEditingText('')
    setEditingStartTs('')
    setEditingEndTs('')
    setEditingError('')
  }

  // Split automático por punto medio; selección de posición de corte queda fuera
  // de alcance de esta iteración.
  function splitPhraseAt(idx: number) {
    const p = phrasesRef.current[idx]
    if (!p || p.text.length < 2) return
    const mid = Math.floor(p.text.length / 2)
    const [a, b] = splitPhrase(p, mid)
    setIsDirty(true)
    setPhrases(prev => [...prev.slice(0, idx), a, b, ...prev.slice(idx + 1)])
    setCurIdx(prev => prev > idx ? prev + 1 : prev)
    setEditingIdx(prev => prev !== null && prev > idx ? prev + 1 : prev)
    if (stageOpenRef.current && idx === curIdxRef.current)
      channelRef.current?.send({ type: 'subtitle', text: a.text, visible: ccRef.current })
  }

  function mergeWithNext(idx: number) {
    const ps = phrasesRef.current
    if (idx < 0 || idx >= ps.length - 1) return
    const merged = mergePhrase(ps[idx], ps[idx + 1])
    setIsDirty(true)
    setPhrases(prev => [...prev.slice(0, idx), merged, ...prev.slice(idx + 2)])
    setCurIdx(prev => {
      if (prev === idx + 1) return idx
      if (prev > idx + 1) return prev - 1
      return prev
    })
    setEditingIdx(prev => {
      if (prev === null) return null
      if (prev === idx + 1) return null  // frase en edición queda consumida; cancelar edit
      if (prev > idx + 1) return prev - 1
      return prev
    })
    const curI = curIdxRef.current
    if (stageOpenRef.current && (curI === idx || curI === idx + 1))
      channelRef.current?.send({ type: 'subtitle', text: merged.text, visible: ccRef.current })
  }

  function deletePhrase(idx: number) {
    const ps = phrasesRef.current
    setIsDirty(true)
    setPhrases(prev => prev.filter((_, i) => i !== idx))
    setCurIdx(prev => {
      if (prev < idx)  return prev
      if (prev > idx)  return prev - 1
      if (ps.length === 1) return -1
      return idx > 0 ? idx - 1 : 0
    })
    setEditingIdx(prev => {
      if (prev === null) return null
      if (prev === idx)  return null  // frase editada fue eliminada; cancelar edit
      if (prev > idx)    return prev - 1
      return prev
    })
    // Stage notification handled by the curIdx effect: fires when curIdx changes,
    // sends phrasesRef.current[newCurIdx] or {text:'', visible:false} if -1.
  }

  function addPhrase() {
    const currentTime = stageOpenRef.current
      ? lastStageTimeRef.current
      : (vidRef.current?.currentTime ?? 0)
    const insertIdx = phrasesRef.current.findIndex(p => p.start > currentTime)
    const finalIdx  = insertIdx === -1 ? phrasesRef.current.length : insertIdx
    // sel:true: newly added phrases are assumed practice material by default.
    // end is not clamped to video duration — inoffensive; teacher can adjust via timestamp edit.
    const newPhrase: Phrase = { start: currentTime, end: currentTime + 2, text: 'Nueva frase', sel: true }
    setIsDirty(true)
    setPhrases(prev => {
      const next = [...prev]
      next.splice(finalIdx, 0, newPhrase)
      return next
    })
    setCurIdx(finalIdx)
    // editingIdx is impossible here: button is disabled when editingIdx !== null
  }

  // ─── Derived ─────────────────────────────────────────────────────────────
  const isTranscribing = step !== 'idle' && step !== 'done'
  const selPhrases     = phrases.filter(p => p.sel)
  const showPhrases    = filter === 'sel' ? phrases.filter(p => p.sel) : phrases

  const STEP_ORDER: Step[] = ['uploading', 'transcribing', 'parsing', 'done']
  const STEP_LABELS: Record<string, string> = {
    uploading:    'Subiendo video a Gemini',
    transcribing: 'Gemini transcribiendo el audio',
    parsing:      'Generando archivo SRT',
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>

      {screen === 'load' && (
        <div className={styles.loadScreen}>
          <div className={styles.logo}><span className={styles.logoDot} />Virtual English — Player</div>

          {!isTranscribing ? (
            <>
              <label
                className={styles.dropzone}
                onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute('data-drag', 'true') }}
                onDragLeave={e => e.currentTarget.removeAttribute('data-drag')}
                onDrop={e => { e.preventDefault(); e.currentTarget.removeAttribute('data-drag'); handleFiles(Array.from(e.dataTransfer.files)) }}
              >
                <input type="file" accept="video/*,.avi,.mp4,.mkv,.mov,.webm,.srt" multiple
                  onChange={e => handleFiles(Array.from(e.target.files || []))} style={{ display: 'none' }} />
                <div className={styles.dzIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className={styles.dzTitle}>Arrastrá el video aquí</div>
                <div className={styles.dzSub}>
                  Gemini transcribe el audio automáticamente y genera el SRT.<br />
                  También podés arrastrar video + SRT juntos si ya lo tenés.
                </div>
                <div className={styles.dzFormats}>
                  {['MP4', 'AVI', 'MKV', 'MOV', 'WEBM', 'SRT'].map(f => (
                    <span key={f} className={`${styles.fmt} ${['MP4', 'AVI', 'SRT'].includes(f) ? styles.fmtHi : ''}`}>{f}</span>
                  ))}
                </div>
              </label>
              {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}
            </>
          ) : (
            <div className={styles.progressBox}>
              <div className={styles.progTitle}>{stepMsg || 'Procesando...'}</div>
              <div className={styles.progSub}>
                {step === 'uploading'    && 'El video se sube directamente a Gemini desde tu navegador.'}
                {step === 'transcribing' && 'Gemini está analizando el audio y generando timestamps precisos...'}
                {step === 'parsing'      && 'Generando archivo SRT...'}
              </div>
              <div className={styles.progBarWrap}>
                <div className={styles.progBarFill} style={{ width: progress + '%' }} />
              </div>
              <div className={styles.stepList}>
                {STEP_ORDER.filter(s => s !== 'done').map(s => {
                  const si = STEP_ORDER.indexOf(step), ti = STEP_ORDER.indexOf(s)
                  const st = ti < si ? 'done' : ti === si ? 'active' : 'idle'
                  return (
                    <div key={s} className={`${styles.stepItem} ${styles['si_' + st]}`}>
                      <span className={styles.stepDot} />{STEP_LABELS[s]}
                    </div>
                  )
                })}
              </div>
              <button className={styles.cancelBtn} onClick={cancelTranscription}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {screen === 'player' && (
        <div className={styles.playerWrap}>
          <div className={styles.topbar}>
            <div className={styles.tbLogo}><span className={styles.tbDot} />Virtual English</div>
            <div className={styles.tbSep} />
            <div className={styles.tbFile}>{videoFileName}</div>
            <div className={styles.tbRight}>
              <span className={`${styles.chip} ${styles.chipFmt}`}>{videoFileName.split('.').pop()?.toUpperCase()}</span>
              <span className={`${styles.chip} ${styles.chipSrt}`}>{srtSource}</span>
              <span className={`${styles.chip} ${styles.chipZoom}`}><span className={styles.liveDot} />Zoom</span>
              <button className={styles.tbBtn} onClick={downloadSRT}>↓ SRT</button>
              <button className={styles.tbBtn} onClick={stageOpen ? () => closeStage(true) : openStage}>
                {stageOpen ? '✕ Cerrar stage' : '▶ Abrir stage'}
              </button>
              <button className={styles.tbBtn} onClick={handleExitAttempt}>← Cargar otro</button>
            </div>
          </div>

          {restorePrompt !== null && (
            <div className={styles.restoreBanner}>
              <span className={styles.restoreBannerText}>
                ¿Restaurar sesión anterior? ({restorePrompt.phrases.length} frases guardadas)
              </span>
              <button className={styles.restoreBtn} onClick={() => handleRestore(restorePrompt)}>Restaurar</button>
              <button className={styles.discardBtn} onClick={handleDiscard}>Descartar</button>
            </div>
          )}

          <div className={styles.layout}>
            <div className={styles.stage} id="ve-stage-wrap">
              {stageOpen
                ? <div className={styles.shareHint}><span className={styles.shareHintDot} />Stage abierto en ventana separada — compartí esa ventana en Zoom</div>
                : <div className={styles.shareHint}><span className={styles.shareHintDot} />Compartir en Zoom — el alumno solo ve esto</div>
              }
              <div className={styles.videoWrap}>
                <video ref={vidRef} src={stageOpen ? undefined : (videoUrl || undefined)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
                {ccOn && subText && !stageOpen && !hideTexts && (
                  <div className={styles.subOverlay}>
                    <div className={styles.subBox}>{subTextNodes}</div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelBody}>
                <div className={styles.section}>
                  <div className={styles.secLabel}>Reproduciendo <span className={styles.secBadge}>⊘ Solo profesor</span></div>
                  <div className={styles.npTitle}>{videoFileName.replace(/\.[^.]+$/, '')}</div>
                  <div className={styles.npMeta}>{timeTot} · {selPhrases.length} frases sel.</div>
                  <div className={styles.prog}>
                    <div className={styles.progTimes}><span>{timeCur}</span><span>{timeTot}</span></div>
                    <div ref={progRef} className={styles.progTrack} onClick={scrub}>
                      <div className={styles.pBuf}   style={{ width: bufPct + '%' }} />
                      <div className={styles.pFill}  style={{ width: progPct + '%' }} />
                      <div className={styles.pThumb} style={{ left: progPct + '%' }} />
                      {phrases.map((p, i) => (
                        <div key={i} className={`${styles.ptick} ${p.sel ? styles.ptickSel : ''}`}
                          style={{ left: stageOpen
                            ? (stageDurationRef.current ? (p.start / stageDurationRef.current * 100) + '%' : '0%')
                            : (vidRef.current?.duration ? (p.start / vidRef.current.duration * 100) + '%' : '0%') }} />
                      ))}
                    </div>
                  </div>
                  <div className={styles.pb}>
                    <button className={styles.pbBtn} onClick={() => skip(-10)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 4v6h6" /><path d="M3.5 15A9 9 0 1 0 4 8.5" /></svg>
                    </button>
                    <div className={styles.pbSep} />
                    <button className={styles.pbBtn} onClick={prevPhrase}>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 20L9 12l10-8v16zM5 4h2v16H5z" /></svg>
                    </button>
                    <button className={`${styles.pbBtn} ${styles.pbPlay}`} onClick={togglePlay}>
                      {isPlaying
                        ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
                    </button>
                    <button className={styles.pbBtn} onClick={nextPhrase}>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8V4zM17 4h2v16h-2z" /></svg>
                    </button>
                    <div className={styles.pbSep} />
                    <button className={styles.pbBtn} onClick={() => skip(10)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6" /><path d="M20.5 15A9 9 0 1 1 20 8.5" /></svg>
                    </button>
                  </div>
                  <button className={styles.ccRow} onClick={() => { setCcOn(p => !p); setIsDirty(true) }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="13" rx="2" /><path d="M8 12h4M14 12h2M8 16h2M12 16h4" /></svg>
                    <span className={styles.ccLbl}>Subtítulos</span>
                    <span className={`${styles.ccBadge} ${ccOn ? styles.ccOn : styles.ccOff}`}>{ccOn ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Frase actual</div>
                  <div className={styles.currPhrase}>{curIdx >= 0 ? phrases[curIdx]?.text : '—'}</div>
                  <div className={styles.phraseCtrl}>
                    <button className={styles.phBtn} onClick={prevPhrase}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>Anterior
                    </button>
                    <div className={styles.phCtr}>{curIdx >= 0 ? `${curIdx + 1} / ${phrases.length}` : '— / —'}</div>
                    <button className={styles.phBtn} onClick={nextPhrase}>
                      Siguiente<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </div>
                  <div className={styles.microGrid}>
                    <button className={`${styles.mcBtn} ${styles.mcBl}`} onClick={microRepeat}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" /></svg>
                      Micro-rep.<span className={styles.kc}>W</span>
                    </button>
                    <button className={styles.mcBtn} onClick={repeatPhrase}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                      Repetir<span className={styles.kc}>R</span>
                    </button>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Modo</div>
                  <div className={styles.modeBtns}>
                    <button className={`${styles.modeBtn} ${autoPause ? styles.modeBtnAct : ''}`}
                            onClick={() => setAutoPause(p => !p)}>Auto-pausa</button>
                    <button className={`${styles.modeBtn} ${practiceMode ? styles.modeBtnAct : ''}`}
                            disabled={selPhrases.length === 0}
                            onClick={() => setPracticeMode(p => !p)}>Práctica</button>
                    <button className={`${styles.modeBtn} ${loopMode ? styles.modeBtnAct : ''}`}
                            onClick={() => setLoopMode(p => !p)}>Loop</button>
                    <button className={`${styles.modeBtn} ${hideTexts ? styles.modeBtnAct : ''}`}
                            onClick={() => setHideTexts(p => !p)}>Ocultar</button>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Velocidad</div>
                  <div className={styles.speedBtns}>
                    {SPEEDS.map((s, i) => (
                      <button key={s} className={`${styles.sp} ${i === speedIdx ? styles.spAct : ''}`} onClick={() => setSpd(i)}>{s}×</button>
                    ))}
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Delay subtítulos</div>
                  <div className={styles.delayRow}>
                    <button className={styles.delayBtn} onClick={() => adjDelay(-0.5)}>−</button>
                    <div className={styles.delayVal} style={{ color: delay === 0 ? '#E8C547' : delay > 0 ? '#4B8FD8' : '#CC4444' }}>
                      {delay > 0 ? '+' : ''}{delay.toFixed(1)} s
                    </div>
                    <button className={styles.delayBtn} onClick={() => adjDelay(0.5)}>+</button>
                    <span className={styles.delayReset} onClick={() => { setDelay(0); delayRef.current = 0; setIsDirty(true) }}>reset</span>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Volumen</div>
                  <div className={styles.volRow}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                    <div className={styles.volTrack}>
                      <div className={styles.volFill} style={{ width: vol + '%' }} />
                      <input type="range" className={styles.volRange} min={0} max={100} value={vol}
                        onChange={e => { setVol(+e.target.value); if (vidRef.current) vidRef.current.volume = +e.target.value / 100 }} />
                    </div>
                    <span className={styles.volVal}>{vol}%</span>
                  </div>
                </div>

                <div className={styles.plWrap}>
                  <div className={styles.plHd}>
                    Secuencia
                    <div className={styles.plHdR}>
                      <span className={styles.plCount}>{selPhrases.length} sel.</span>
                      <button
                        className={styles.plFilter}
                        onClick={() => { setPhrases(prev => prev.map(p => ({ ...p, sel: true }))); setIsDirty(true) }}
                      >Todas ✓</button>
                      <button
                        className={styles.plFilter}
                        onClick={() => { setPhrases(prev => prev.map(p => ({ ...p, sel: false }))); setIsDirty(true) }}
                      >Ninguna</button>
                      <button
                        className={styles.plFilter}
                        onClick={addPhrase}
                        disabled={editingIdx !== null}
                      >Agregar frase</button>
                      {(['all', 'sel'] as const).map(f => (
                        <button key={f} className={`${styles.plFilter} ${filter === f ? styles.plFilterAct : ''}`} onClick={() => setFilter(f)}>
                          {f === 'all' ? 'Todas' : 'Sel.'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div ref={listRef} className={styles.pl}>
                    {showPhrases.length === 0 && <div className={styles.plEmpty}>Sin frases</div>}
                    {showPhrases.map(p => {
                      const oi = phrases.indexOf(p), si = selPhrases.indexOf(p), isAct = oi === curIdx
                      return (
                        <div key={oi} data-act={isAct}
                          className={`${styles.plItem} ${isAct ? styles.plAct : ''} ${p.sel ? styles.plSel : ''}`}
                          onClick={() => { if (editingIdx !== oi) jumpTo(oi) }}>
                          <div className={styles.plN}>{p.sel ? si + 1 : '·'}</div>
                          <div className={styles.plB}>
                            <div className={styles.plT}>{fmtTime(p.start)}</div>
                            {editingIdx === oi ? (
                              <div className={styles.plEdit} onClick={e => e.stopPropagation()}>
                                <input
                                  className={styles.plEditInput}
                                  value={editingText}
                                  onChange={e => setEditingText(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(oi); if (e.key === 'Escape') cancelEdit() }}
                                  autoFocus
                                />
                                <div className={styles.plEditTs}>
                                  <input
                                    className={styles.plEditTsInput}
                                    aria-label="inicio"
                                    value={editingStartTs}
                                    onChange={e => { setEditingStartTs(e.target.value); setEditingError('') }}
                                  />
                                  <span>→</span>
                                  <input
                                    className={styles.plEditTsInput}
                                    aria-label="fin"
                                    value={editingEndTs}
                                    onChange={e => { setEditingEndTs(e.target.value); setEditingError('') }}
                                  />
                                </div>
                                {editingError && <div className={styles.plEditError}>{editingError}</div>}
                                <div className={styles.plEditBtns}>
                                  <button className={styles.plEditSave}   onClick={() => saveEdit(oi)}>✓</button>
                                  <button className={styles.plEditCancel} onClick={cancelEdit}>✕</button>
                                </div>
                              </div>
                            ) : (
                              <div className={styles.plTxRow}>
                                <div className={styles.plTx}>{hideTexts ? '' : p.text}</div>
                                <button className={styles.plEditBtn} onClick={e => { e.stopPropagation(); startEdit(oi) }} title="Editar">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                {p.text.length >= 2 && (
                                  <button className={styles.plEditBtn} onClick={e => { e.stopPropagation(); splitPhraseAt(oi) }} title="Dividir">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                      <line x1="12" y1="3" x2="12" y2="21"/>
                                      <polyline points="7 8 12 3 17 8"/>
                                      <polyline points="7 16 12 21 17 16"/>
                                    </svg>
                                  </button>
                                )}
                                {oi < phrases.length - 1 && (
                                  <button className={styles.plEditBtn} onClick={e => { e.stopPropagation(); mergeWithNext(oi) }} title="Unir con siguiente">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                      <polyline points="17 8 12 3 7 8"/>
                                      <line x1="12" y1="3" x2="12" y2="21"/>
                                    </svg>
                                  </button>
                                )}
                                <button className={styles.plEditBtn} onClick={e => { e.stopPropagation(); deletePhrase(oi) }} title="Eliminar">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                          <div className={styles.plCk} onClick={e => { e.stopPropagation(); toggleSel(oi) }}>
                            {p.sel && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className={styles.kbHint}>
                  {[['Spc', 'Play'], ['A', '← Frase'], ['D', 'Frase →'], ['W', 'Micro'], ['R', 'Repetir']].map(([k, l]) => (
                    <span key={k} className={styles.kbItem}><span className={styles.kbKey}>{k}</span>{l}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {exitDialog && (
            <div className={styles.exitOverlay}>
              <div className={styles.exitDialog}>
                <div className={styles.exitTitle}>¿Salir con cambios sin guardar?</div>
                <button className={styles.exitBtnPrimary} onClick={() => { downloadSRT(); backToLoad() }}>
                  Descargar SRT y salir
                </button>
                <button className={styles.exitBtn} onClick={backToLoad}>Salir sin guardar</button>
                <button className={styles.exitBtnCancel} onClick={() => setExitDialog(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

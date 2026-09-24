'use client'
// "Voces más claras" — barra del player que realza los diálogos sobre la música de
// fondo. Todo en el navegador (lib/voiceBoost.ts). NO se guarda: es del momento.
// Con el stage abierto el audio sale de ESA ventana: el valor se le manda al stage
// (lib/voiceBoostStage.ts, que sigue vivo aunque esta barra se desmonte al pasar a
// Ejercicios), y el stage contesta si pudo aplicarlo.
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import styles from './VoiceBoostControl.module.css'
import { sharedVoiceBoostStageLink } from '@/lib/voiceBoostStage'
import { sharedVoiceBoost, voiceBoostLabel, type VoiceBoostStatus } from '@/lib/voiceBoost'

export const VOICE_BOOST_TEXTS = {
  label: 'Voces más claras',
  desc: 'Resalta los diálogos sobre la música',
  tooltip: 'Resalta las voces y baja un poco la música de fondo, para que los diálogos se entiendan mejor. No es otro volumen. A la izquierda: audio original.',
  off: 'apagar',
  unavailable: 'El navegador no dejó activarlo. Probá mover la barra de nuevo.',
  stageUnavailable: 'Hacé un clic en la ventana del stage para activarlo.',
} as const

type Props = { videoRef: RefObject<HTMLVideoElement | null>; stageOpen: boolean }

export default function VoiceBoostControl({ videoRef, stageOpen }: Props) {
  const vb = sharedVoiceBoost()
  const [amount, setAmount] = useState(() => vb.amount)
  const [status, setStatus] = useState<VoiceBoostStatus>('off')
  const [stageStatus, setStageStatus] = useState<VoiceBoostStatus>('off')
  const seqRef = useRef(0) // solo cuenta la respuesta del último movimiento

  // El <video> del panel: si la barra ya estaba arriba (volvió al player), se engancha.
  useEffect(() => {
    let alive = true
    vb.attach(videoRef.current).then(s => { if (alive) setStatus(s) })
    return () => { alive = false; vb.attach(null) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que contestó el stage (el enlace se crea acá, en el navegador, no en el server).
  useEffect(() => {
    const link = sharedVoiceBoostStageLink()
    setStageStatus(link.stageStatus)
    return link.subscribe(setStageStatus)
  }, [])

  function change(next: number) {
    setAmount(next)
    const seq = ++seqRef.current
    vb.set(next).then(s => { if (seq === seqRef.current) setStatus(s) }) // dentro del gesto
    sharedVoiceBoostStageLink().send(next)
  }

  // El nivel se ve en la barra (más llena / más vacía); en palabras solo para lectores de pantalla.
  const label = voiceBoostLabel(amount)
  const on = amount > 0
  const hint =
    amount === 0 ? null
    : stageOpen ? (stageStatus === 'unavailable' ? VOICE_BOOST_TEXTS.stageUnavailable : null)
    : (status === 'unavailable' ? VOICE_BOOST_TEXTS.unavailable : null)

  return (
    <div className={styles.section}>
      <div className={`${styles.card} ${on ? styles.cardOn : ''}`} title={VOICE_BOOST_TEXTS.tooltip}>
        <div className={styles.head}>
          <span className={styles.icon} aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </span>
          <span className={styles.title}>{VOICE_BOOST_TEXTS.label}</span>
          <span className={styles.desc}>{VOICE_BOOST_TEXTS.desc}</span>
          <button type="button" className={`${styles.off} ${on ? '' : styles.offHidden}`}
            onClick={() => change(0)} tabIndex={on ? 0 : -1} aria-hidden={!on}>
            {VOICE_BOOST_TEXTS.off}
          </button>
        </div>
        <input type="range" className={`${styles.range} ${on ? '' : styles.rangeZero}`}
          min={0} max={100} step={1} value={amount}
          style={{ '--pct': amount + '%' } as CSSProperties}
          aria-label={VOICE_BOOST_TEXTS.label} aria-valuetext={label}
          onChange={e => change(+e.target.value)} />
        {hint && <div role="status" className={styles.hint}>{hint}</div>}
      </div>
    </div>
  )
}

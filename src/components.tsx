import { useCallback, useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Check, ChevronLeft, Link2, Pause, Play, X } from 'lucide-react'

const dialogStack: HTMLElement[] = []

export function Brand() {
  return <div className="brand" aria-label="Elo"><span className="brand-mark"><i /><i /><i /></span><strong>elo</strong></div>
}

export function Eyebrow({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <span className={accent ? 'eyebrow accent-text' : 'eyebrow'}>{children}</span>
}

export function PageIntro({ eyebrow, title, copy, action }: { eyebrow: string; title: ReactNode; copy?: string; action?: ReactNode }) {
  return <header className="page-intro"><div><Eyebrow accent>{eyebrow}</Eyebrow><h2>{title}</h2>{copy && <p>{copy}</p>}</div>{action}</header>
}

export function SectionTitle({ index, title, copy, action }: { index?: string; title: string; copy?: string; action?: ReactNode }) {
  return <div className="section-title">{index && <span>{index}</span>}<div><h3>{title}</h3>{copy && <p>{copy}</p>}</div>{action && <div className="section-action">{action}</div>}</div>
}

export function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button type="button" className={`button ${variant} ${className}`} {...props}>{children}</button>
}

function useDialogBehavior(ref: RefObject<HTMLElement | null>, onClose: () => void, returnFocusRef: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = returnFocusRef.current
    const dialog = ref.current
    if (!dialog) return
    dialogStack.push(dialog)
    const selector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(selector) ?? [])
    const frame = window.requestAnimationFrame(() => {
      const preferred = ref.current?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]):not(.modal-close)')
      ;(preferred ?? ref.current)?.focus()
    })
    const onKey = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) { event.preventDefault(); dialog.focus(); return }
      const first = items[0]; const last = items[items.length - 1]
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      const index = dialogStack.lastIndexOf(dialog)
      if (index >= 0) dialogStack.splice(index, 1)
      if (!dialogStack.length) document.body.classList.remove('modal-open')
      if (previous?.isConnected) previous.focus()
    }
  }, [ref])
}

function closeFromBackdrop(event: React.MouseEvent<HTMLElement>, onClose: () => void) {
  if (event.button === 0 && event.target === event.currentTarget) onClose()
}

function useAnimatedDialogClose(onClose: () => void) {
  return useCallback(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true
    const transitionDocument = document as Document & { startViewTransition?: (update: () => void) => unknown }
    if (reduceMotion || !transitionDocument.startViewTransition) {
      onClose()
      return
    }
    transitionDocument.startViewTransition(() => flushSync(onClose))
  }, [onClose])
}

export function Modal({ title, eyebrow, onClose, children, size = 'medium' }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; size?: 'small' | 'medium' | 'large' }) {
  const ref = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null)
  const titleId = useId()
  const requestClose = useAnimatedDialogClose(onClose)
  useDialogBehavior(ref, requestClose, returnFocusRef)
  return createPortal(<div className="modal-backdrop" onMouseDown={(event) => closeFromBackdrop(event, requestClose)}>
    <section ref={ref} className={`modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="icon-button modal-close" onClick={requestClose} aria-label="Fechar"><X size={19} /></button>
      {eyebrow && <Eyebrow accent>{eyebrow}</Eyebrow>}<h2 id={titleId}>{title}</h2>{children}
    </section>
  </div>, document.body)
}

export function Drawer({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null)
  const titleId = useId()
  const requestClose = useAnimatedDialogClose(onClose)
  useDialogBehavior(ref, requestClose, returnFocusRef)
  return createPortal(<div className="modal-backdrop" onMouseDown={(event) => closeFromBackdrop(event, requestClose)}><aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
    <button type="button" className="icon-button modal-close" onClick={requestClose} aria-label="Fechar"><X size={19} /></button>
    {eyebrow && <Eyebrow accent>{eyebrow}</Eyebrow>}<h2 id={titleId}>{title}</h2>{children}
  </aside></div>, document.body)
}

export function BackButton({ onClick, label = 'Voltar' }: { onClick: () => void; label?: string }) {
  return <button type="button" className="back-button" onClick={onClick}><ChevronLeft size={17} />{label}</button>
}

export function Segmented({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; label: string }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option) => <button type="button" key={option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)} aria-pressed={value === option.value}>{option.label}</button>)}</div>
}

export function Progress({ value, label }: { value: number; label: string }) {
  const bounded = Math.max(0, Math.min(100, value))
  return <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}><i style={{ transform: `scaleX(${bounded / 100})` }} /></div>
}

export function MovementDemo({ name, playing, onToggle }: { name: string; playing: boolean; onToggle: () => void }) {
  return <div className={playing ? 'movement-demo playing' : 'movement-demo'}>
    <div className="movement-grid" /><div className="figure" aria-label={`Demonstração de ${name}`} role="img">
      <i className="head" /><i className="torso" /><i className="arm one" /><i className="arm two" /><i className="leg one" /><i className="leg two" /><span className="weight"><i /><i /></span>
    </div>
    <div className="movement-caption"><span><Link2 size={14} /> DEMONSTRAÇÃO VETORIAL · 24s</span><button type="button" onClick={onToggle} aria-label={playing ? 'Pausar demonstração' : 'Tocar demonstração'}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pausar' : 'Tocar'}</button></div>
  </div>
}

export function SuccessState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="success-state"><span><Check size={28} /></span><h3>{title}</h3><p>{copy}</p>{action}</div>
}

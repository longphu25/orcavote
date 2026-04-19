import { Eye, Database, ShieldCheck, Users, ChevronRight } from 'lucide-react'
import { C } from '../../theme'

const useCases = [
  { icon: Eye, title: 'DAO Revenue Reports', desc: 'Let partners view detailed financial data only after council approval — no premature leaks.' },
  { icon: Database, title: 'AI Training Datasets', desc: 'Data DAOs can gate access to valuable training data behind stakeholder consensus.' },
  { icon: ShieldCheck, title: 'Security Audit Logs', desc: 'Auditors and regulators access sensitive system logs only when the governance council agrees.' },
]

export default function UseCases() {
  return (
    <section id="use-cases" style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 16 }}>
          <Users size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>Use Cases</span>
        </div>
        <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(24px,3vw,40px)', fontWeight: 700, color: C.heading, margin: '0 0 12px' }}>Who Is OrcaVote For?</h2>
        <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 560, margin: '0 auto' }}>Any organization that needs governed, privacy-preserving data release.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>
        {useCases.map((uc) => (
          <div key={uc.title} style={{ padding: 32, borderRadius: 20, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', transition: 'border-color 0.2s ease' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
          >
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <uc.icon size={24} color={C.accent} />
            </div>
            <h3 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 18, fontWeight: 600, color: C.heading, margin: '0 0 10px' }}>{uc.title}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, margin: '0 0 16px' }}>{uc.desc}</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: C.accent, cursor: 'pointer' }}>
              Learn more <ChevronRight size={14} />
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

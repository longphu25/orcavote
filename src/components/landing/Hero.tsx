import { Lock, ArrowRight } from 'lucide-react'
import { C } from '../../theme'

export default function Hero() {
  return (
    <section style={{ paddingTop: 140, paddingBottom: 80, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -100, left: '20%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(59,130,246,0.08)', filter: 'blur(100px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -60, right: '15%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(245,158,11,0.06)', filter: 'blur(80px)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 32 }}>
          <Lock size={14} color={C.primary} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>Privacy-Preserving Protocol on Sui</span>
        </div>

        <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(32px,5vw,64px)', fontWeight: 700, lineHeight: 1.15, color: C.heading, margin: '0 0 24px' }}>
          Vote to Unlock<br /><span style={{ color: C.primary }}>Private Data</span>
        </h1>

        <p style={{ fontSize: 18, lineHeight: 1.7, color: C.textMuted, maxWidth: 640, margin: '0 auto 40px' }}>
          OrcaVote releases sensitive datasets only when stakeholders vote to approve.
          Data stays encrypted on Walrus, votes are anonymous via ZK proofs,
          and all governance logic runs on-chain with Move.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <a href="orcavote.html" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 14, background: C.accent, color: '#000', fontSize: 16, fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
            Launch App <ArrowRight size={18} />
          </a>
          <a href="#how-it-works" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 14, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 16, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
            How It Works
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, maxWidth: 600, margin: '56px auto 0' }}>
          {[
            { value: 'ZK Proofs', label: 'Anonymous Voting' },
            { value: 'Seal', label: 'End-to-End Encryption' },
            { value: 'Walrus', label: 'Decentralized Storage' },
          ].map((s) => (
            <div key={s.label} style={{ padding: '20px 12px', borderRadius: 16, border: `1px solid ${C.border}`, background: C.surface }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 16, fontWeight: 700, color: C.primary, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: C.textMuted }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

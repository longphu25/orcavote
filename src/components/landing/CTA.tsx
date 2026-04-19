import { ArrowRight, CheckCircle } from 'lucide-react'
import { C } from '../../theme'

export default function CTA() {
  return (
    <section id="cta" style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ padding: 'clamp(40px,6vw,72px) clamp(24px,4vw,56px)', borderRadius: 24, border: '1px solid rgba(59,130,246,0.3)', background: `linear-gradient(135deg,${C.primaryDark},${C.surface})`, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(24px,4vw,44px)', fontWeight: 700, color: C.heading, margin: '0 0 16px' }}>Ready to Govern Your Data?</h2>
          <p style={{ fontSize: 17, color: '#94A3B8', maxWidth: 520, margin: '0 auto 36px', lineHeight: 1.7 }}>
            Deploy OrcaVote on Sui and give your stakeholders privacy-preserving control over sensitive data release.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a href="orcavote.html" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 14, background: C.accent, color: '#000', fontSize: 16, fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
              Launch App <ArrowRight size={18} />
            </a>
            <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: 16, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
              Read Docs
            </a>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 28, flexWrap: 'wrap' }}>
            {['Open source', 'On-chain verifiable', 'Zero-knowledge'].map((t) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94A3B8' }}>
                <CheckCircle size={14} color={C.green} /> {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

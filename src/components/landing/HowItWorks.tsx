import { Database, FileKey, Fingerprint, ShieldCheck, Zap } from 'lucide-react'
import { C } from '../../theme'

const steps = [
  { num: '01', icon: Database, title: 'Encrypt & Store', desc: 'Data Owner encrypts the dataset with Seal and uploads the ciphertext to Walrus. Only metadata is registered on-chain.' },
  { num: '02', icon: FileKey, title: 'Request Access', desc: 'A Requester creates an AccessRequest specifying purpose, threshold, and deadline. The request is recorded on Sui.' },
  { num: '03', icon: Fingerprint, title: 'Anonymous Vote', desc: 'Council members cast YES/NO votes using ZK proofs — proving membership without revealing identity.' },
  { num: '04', icon: ShieldCheck, title: 'Verify & Release', desc: 'Move contract verifies each Groth16 proof on-chain. If YES votes meet the threshold, Seal releases the decryption key.' },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 16 }}>
          <Zap size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>How It Works</span>
        </div>
        <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(24px,3vw,40px)', fontWeight: 700, color: C.heading, margin: '0 0 12px' }}>
          From Encrypted Data to Governed Release
        </h2>
        <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 560, margin: '0 auto' }}>Four steps. Fully on-chain. Zero trust required.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 24 }}>
        {steps.map((step) => (
          <div key={step.num} style={{ padding: 28, borderRadius: 20, border: `1px solid ${C.border}`, background: C.surface, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 16, right: 20, fontFamily: "'Orbitron',sans-serif", fontSize: 32, fontWeight: 700, color: 'rgba(59,130,246,0.1)' }}>{step.num}</div>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <step.icon size={22} color={C.primary} />
            </div>
            <h3 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 16, fontWeight: 600, color: C.heading, margin: '0 0 8px' }}>{step.title}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, margin: 0 }}>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

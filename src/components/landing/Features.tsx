import { Fingerprint, Lock, Database, ShieldCheck, Vote, Network, Shield } from 'lucide-react'
import { C } from '../../theme'

const features = [
  { icon: Fingerprint, title: 'ZK Anonymous Voting', desc: 'Semaphore-style circuits prove council membership and prevent double-voting without revealing voter identity.' },
  { icon: Lock, title: 'Seal Encryption', desc: 'Datasets are encrypted client-side with IBE. Decryption keys are only released when governance conditions are met.' },
  { icon: Database, title: 'Walrus Storage', desc: 'Ciphertext lives on Walrus — decentralized, censorship-resistant blob storage. On-chain stores only metadata.' },
  { icon: ShieldCheck, title: 'On-Chain Verification', desc: 'Groth16 proofs are verified directly in Move smart contracts. Every vote and tally is transparent and auditable.' },
  { icon: Vote, title: 'Threshold Governance', desc: 'Configurable YES/NO threshold, deadline, and council size. Deterministic finalization logic in Move.' },
  { icon: Network, title: 'Built on Sui', desc: "Leverages Sui's object model, parallel execution, and low-latency finality for responsive governance." },
]

export default function Features() {
  return (
    <section id="features" style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 16 }}>
          <Shield size={14} color={C.green} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Core Features</span>
        </div>
        <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(24px,3vw,40px)', fontWeight: 700, color: C.heading, margin: '0 0 12px' }}>Privacy by Design</h2>
        <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 560, margin: '0 auto' }}>Every layer — encryption, voting, storage, verification — is built for zero-trust privacy.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 24 }}>
        {features.map((f) => (
          <div key={f.title} style={{ padding: 28, borderRadius: 20, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', transition: 'border-color 0.2s ease' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.borderLight)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
          >
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <f.icon size={22} color={C.primary} />
            </div>
            <h3 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 16, fontWeight: 600, color: C.heading, margin: '0 0 8px' }}>{f.title}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

import { Shield } from 'lucide-react'
import { C } from '../../theme'

export default function Navbar() {
  return (
    <nav style={{ position: 'fixed', top: 16, left: 16, right: 16, zIndex: 50, maxWidth: 1152, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px', borderRadius: 16,
          border: `1px solid ${C.border}`, background: 'rgba(10,14,39,0.85)', backdropFilter: 'blur(12px)',
        }}
      >
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.heading, fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: 18 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${C.primary},${C.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={18} color="#fff" />
          </div>
          OrcaVote
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['How it Works', 'Features', 'Use Cases'].map((l) => (
            <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, '-')}`} style={{ textDecoration: 'none', color: C.textMuted, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{l}</a>
          ))}
          <a href="orcavote.html" style={{ padding: '8px 20px', borderRadius: 10, background: C.accent, color: '#000', fontSize: 14, fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
            Get Started
          </a>
        </div>
      </div>
    </nav>
  )
}

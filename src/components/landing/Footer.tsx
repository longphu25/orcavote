import { Shield } from 'lucide-react'
import { C } from '../../theme'

export default function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, padding: '48px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: 16, color: C.heading, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${C.primary},${C.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={16} color="#fff" />
            </div>
            OrcaVote
          </div>
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>Vote-to-unlock private data.<br />Built on Sui.</p>
        </div>
        {[
          { title: 'Protocol', links: ['Documentation', 'GitHub', 'Smart Contracts'] },
          { title: 'Stack', links: ['Sui Move', 'Seal', 'Walrus', 'Groth16'] },
          { title: 'Community', links: ['Discord', 'Twitter', 'Forum'] },
        ].map((col) => (
          <div key={col.title}>
            <h4 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 12, fontWeight: 600, color: C.heading, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{col.title}</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {col.links.map((link) => (
                <li key={link} style={{ marginBottom: 8 }}>
                  <a href="#" style={{ fontSize: 13, color: C.textMuted, textDecoration: 'none', cursor: 'pointer' }}>{link}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${C.border}`, textAlign: 'center', fontSize: 13, color: C.textMuted }}>
        Built for the Sui ecosystem
      </div>
    </footer>
  )
}

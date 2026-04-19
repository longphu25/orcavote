import { useEffect, useRef } from 'react'
import { createTimeline, set as animeSet, stagger } from 'animejs'
import { Cpu, EyeOff, Network, ArrowDown, CheckCircle, Zap } from 'lucide-react'
import { C } from '../../theme'

export default function ZKArchitecture() {
  const containerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // Initial hidden state
    animeSet('.zk-anim-input', { opacity: 0, translateY: -20 })
    animeSet('.zk-anim-arrow1', { opacity: 0, translateY: -10 })
    animeSet('.zk-anim-circuit', { opacity: 0, scale: 0.95 })
    animeSet('.zk-anim-step', { opacity: 0, translateX: -20 })
    animeSet('.zk-anim-arrow2', { opacity: 0, translateY: -10 })
    animeSet('.zk-anim-output', { opacity: 0, scale: 0.9 })

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const tl = createTimeline({ defaults: { ease: 'outExpo' } })
        
        tl.add('.zk-anim-input', {
          opacity: 1,
          translateY: 0,
          duration: 800,
          delay: stagger(200)
        })
        .add('.zk-anim-arrow1', {
          opacity: [0, 1],
          translateY: 0,
          duration: 600,
          delay: stagger(100)
        }, '-=400')
        .add('.zk-anim-circuit', {
          opacity: 1,
          scale: 1,
          duration: 800
        }, '-=200')
        .add('.zk-anim-step', {
          opacity: 1,
          translateX: 0,
          duration: 600,
          delay: stagger(300)
        }, '-=200')
        .add('.zk-anim-arrow2', {
          opacity: [0, 1],
          translateY: 0,
          duration: 600
        }, '-=200')
        .add('.zk-anim-output', {
          opacity: 1,
          scale: 1,
          duration: 1000
        }, '-=200')

        observer.disconnect()
      }
    }, { threshold: 0.3 })

    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="zk-architecture" ref={containerRef} style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 16 }}>
          <Cpu size={14} color="#10B981" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#10B981' }}>ZK Proof System</span>
        </div>
        <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(24px,3vw,40px)', fontWeight: 700, color: C.heading, margin: '0 0 12px' }}>Circuit Architecture</h2>
        <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 640, margin: '0 auto' }}>Groth16 zero-knowledge proof on BN254 curve. Ensures anonymous voting with exactly 1 vote per member.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 860, margin: '0 auto' }}>
        
        {/* INPUTS ROW */}
        <div style={{ display: 'flex', gap: 24, width: '100%', marginBottom: 16, flexWrap: 'wrap' }}>
          {/* PRIVATE INPUTS */}
          <div className="zk-anim-input" style={{ flex: 1, minWidth: 300, padding: 24, borderRadius: 20, border: `1px dashed rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <EyeOff size={18} color="#EF4444" />
              <h3 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 16, fontWeight: 700, color: '#EF4444', margin: 0 }}>Private Inputs</h3>
            </div>
            <p style={{ fontSize: 13, color: '#EF4444', opacity: 0.8, marginBottom: 16 }}>Only the voter knows. Never revealed.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['identity_secret', 'identity_nullifier', 'path_elements[10]', 'path_indices[10]'].map(i => (
                <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: `1px solid rgba(239,68,68,0.15)`, fontSize: 13, fontFamily: 'monospace', color: C.text, display: 'flex', alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', marginRight: 10, display: 'inline-block' }}></span>
                  {i}
                </div>
              ))}
            </div>
          </div>

          {/* PUBLIC INPUTS */}
          <div className="zk-anim-input" style={{ flex: 1, minWidth: 300, padding: 24, borderRadius: 20, border: `1px dashed rgba(16,185,129,0.3)`, background: 'rgba(16,185,129,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Network size={18} color="#10B981" />
              <h3 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 16, fontWeight: 700, color: '#10B981', margin: 0 }}>Public Inputs</h3>
            </div>
            <p style={{ fontSize: 13, color: '#10B981', opacity: 0.8, marginBottom: 16 }}>Visible to everyone on-chain.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['merkle_root', 'nullifier_hash', 'signal_hash', 'external_nullifier'].map(i => (
                <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: `1px solid rgba(16,185,129,0.15)`, fontSize: 13, fontFamily: 'monospace', color: C.text, display: 'flex', alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', marginRight: 10, display: 'inline-block' }}></span>
                  {i}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ARROWS DOWN */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'calc(50% - 24px)', width: '100%', marginBottom: 16, opacity: 0.5 }}>
           <ArrowDown className="zk-anim-arrow1" size={24} color={C.textMuted} />
           <ArrowDown className="zk-anim-arrow1" size={24} color={C.textMuted} />
        </div>

        {/* CIRCUIT MAIN BLOCK */}
        <div className="zk-anim-circuit" style={{ width: '100%', padding: 'clamp(24px, 4vw, 40px)', borderRadius: 24, border: `1px solid ${C.primary}`, background: `linear-gradient(180deg, rgba(59,130,246,0.08), rgba(0,0,0,0))`, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -100, right: -100, width: 200, height: 200, background: 'rgba(59,130,246,0.15)', filter: 'blur(80px)', pointerEvents: 'none' }} />
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg,${C.primary},${C.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 24px rgba(59,130,246,0.2)` }}>
              <Cpu size={24} color="#fff" />
            </div>
            <h3 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 700, color: C.heading, margin: 0 }}>OrcaVote Circuit</h3>
          </div>

          <div style={{ display: 'grid', gap: 12, position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto' }}>
            {[
              { step: 1, text: 'commitment = Poseidon(nullifier, secret)', label: 'Identity Commitment' },
              { step: 2, text: 'leaf == merkle_root', label: 'Merkle Proof: commitment ∈ tree' },
              { step: 3, text: 'nullifier_hash = Poseidon(secret, ext_null)', label: 'Nullifier Hash' },
              { step: 4, text: 'signal_hash_sq = signal_hash × signal_hash', label: 'Signal Constraint' },
            ].map(s => (
               <div key={s.step} className="zk-anim-step" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '12px 20px', borderRadius: 12, background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(255,255,255,0.05)` }}>
                 <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', border: `1px solid rgba(59,130,246,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.primary, flexShrink: 0 }}>{s.step}</div>
                 <div style={{ flex: '1 1 200px', fontFamily: 'monospace', fontSize: 13, color: '#E2E8F0' }}>{s.text}</div>
                 <div style={{ fontSize: 11, color: C.primary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, borderLeft: `1px solid rgba(255,255,255,0.1)`, paddingLeft: 12 }}>{s.label}</div>
               </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 32, paddingTop: 24, borderTop: `1px solid rgba(255,255,255,0.05)`, fontSize: 13, color: '#94A3B8', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={14} color={C.primary} /> <strong style={{ color: C.heading }}>Constraints:</strong> 2911</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={14} color={C.primary} /> <strong style={{ color: C.heading }}>Curve:</strong> BN254</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={14} color={C.primary} /> <strong style={{ color: C.heading }}>Tree depth:</strong> 10 (max 1024)</span>
          </div>
        </div>

        {/* ARROW DOWN */}
        <div style={{ margin: '16px 0' }}>
           <ArrowDown className="zk-anim-arrow2" size={32} color={C.accent} style={{ filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.4))' }} />
        </div>

        {/* OUTPUT */}
        <div className="zk-anim-output" style={{ padding: '24px 40px', borderRadius: 20, border: `1px solid ${C.accent}`, background: 'rgba(245,158,11,0.08)', textAlign: 'center', boxShadow: '0 8px 32px rgba(245,158,11,0.05)' }}>
           <h4 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 18, fontWeight: 700, color: C.accent, margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
             <Zap size={20} /> Groth16 Proof Generated
           </h4>
           <div style={{ fontSize: 15, color: '#E2E8F0', fontFamily: 'monospace', opacity: 0.9 }}>128 bytes Proof + Public Signals (4 × 32 bytes)</div>
        </div>

      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import gsap from 'gsap'
import { Layers, Database, Cpu, Globe, Fingerprint, ShieldCheck, Zap } from 'lucide-react'
import { C } from '../../theme'

const architectureLayers = [
  {
    id: 1,
    title: 'Off-chain: ZK Circuit',
    icon: Fingerprint,
    color: '#ec4899', // Pink
    items: [
      'Circuit Groth16 trên BN254, kiểu Semaphore',
      'Poseidon Merkle tree depth 10 (hỗ trợ 1024 voters)',
      'Proof generation trong browser',
    ]
  },
  {
    id: 2,
    title: 'Off-chain: Seal + Walrus',
    icon: Database,
    color: '#10b981', // Emerald
    items: [
      'Dataset encrypted bằng Seal, lưu trên Walrus',
      'Identity blobs cho mỗi voter cũng lưu trên Walrus',
      '3 Seal policies: data asset (owner), dataset (post), identity',
    ]
  },
  {
    id: 3,
    title: 'On-chain: Move Smart Contracts',
    icon: Cpu,
    color: '#f59e0b', // Amber
    items: [
      '5 modules: registry, governance, zk_vote, seal_policy, data_asset',
      'Groth16 proof verification on-chain',
      'Nullifier dedup ngăn double-vote',
      'Poll lifecycle: Setup → Voting → Approved/Rejected',
    ]
  },
  {
    id: 4,
    title: 'Frontend: React + Vite',
    icon: Globe,
    color: '#3b82f6', // Blue
    items: [
      '3 tabs: Data Asset, Tạo Poll, Polls',
      'Wallet connect via @mysten/dapp-kit',
      'ZK proof generation via snarkjs trong browser',
    ]
  }
]

export default function Architecture() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activeLayer, setActiveLayer] = useState(0)

  // Animated Merkle Tree Canvas Effect
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = canvas.offsetWidth
    let height = canvas.offsetHeight

    const resizeCanvas = () => {
      width = canvas.offsetWidth
      height = canvas.offsetHeight
      canvas.width = width * window.devicePixelRatio
      canvas.height = height * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()

    let progress = 0;
    let animationFrameId: number;

    const drawTree = (p: number) => {
      ctx.clearRect(0, 0, width, height)
      
      const drawBranch = (bx: number, by: number, length: number, angle: number, depth: number, maxDepth: number, tp: number, maxNodes: number) => {
        if (depth > maxDepth || tp <= 0) return;
        
        // Growth calculation
        const nx = bx + Math.cos(angle) * length * Math.min(1, tp * 1.5)
        const ny = by + Math.sin(angle) * length * Math.min(1, tp * 1.5)
        
        // Color based on layer status
        let alpha = 0.3 + (tp * 0.5)
        if (depth === maxDepth) alpha = tp * 0.8 // Leaves
        
        // Nodes style
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(nx, ny)
        // Dynamic colors blending
        ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`
        ctx.lineWidth = Math.max(1, 4 - depth * 0.4)
        ctx.stroke()
        
        // Draw leaf/node
        if (tp > 0.5) {
          ctx.beginPath()
          ctx.arc(nx, ny, Math.max(1.5, 4 - depth * 0.3), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`
          ctx.fill()

          if (depth < maxDepth) {
            const nextTp = (tp - 0.5) * 2;
            const spread = 0.8 - depth * 0.1;
            drawBranch(nx, ny, length * 0.75, angle - spread, depth + 1, maxDepth, nextTp, maxNodes)
            drawBranch(nx, ny, length * 0.75, angle + spread, depth + 1, maxDepth, nextTp, maxNodes)
          }
        }
      }

      // Root of Poseidon Merkle Tree (Bottom to Top)
      const rootX = width / 2;
      const rootY = height + 20;

      // Draw mathematical branching for depth 10 concept (we draw fewer levels to stay performant but dense)
      drawBranch(rootX, rootY, height * 0.25, -Math.PI / 2, 0, 7, p, 1024);
      
      // Data connection beams overlay
      if (p > 0.6) {
        for(let i=0; i<10; i++) {
           const yLine = height - (height * p) + (Math.random() * 50)
           if (yLine > 0 && yLine < height) {
              ctx.beginPath()
              ctx.moveTo(0, yLine)
              ctx.lineTo(width, yLine)
              ctx.strokeStyle = `rgba(236, 72, 153, ${Math.random() * 0.15})`
              ctx.lineWidth = 1
              ctx.stroke()
           }
        }
      }
    }

    const render = () => {
      progress += 0.005;
      if (progress > 1.2) progress = 0; // Loop the tree growth
      drawTree(Math.min(1, progress))
      animationFrameId = requestAnimationFrame(render)
    }
    
    render()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  // Auto layout switcher
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLayer((prev) => (prev + 1) % architectureLayers.length)
    }, 4500) // Switch every 4.5 seconds

    return () => clearInterval(interval)
  }, [])

  return (
    <section id="architecture" style={{ padding: '100px 24px', maxWidth: 1152, margin: '0 auto', position: 'relative' }}>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        style={{ textAlign: 'center', marginBottom: 56, position: 'relative', zIndex: 10 }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 16 }}>
          <Layers size={14} color="#8b5cf6" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#8b5cf6' }}>Core System Architecture</span>
        </div>
        <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, color: C.heading, margin: '0 0 12px' }}>4-Layer Privacy Stack</h2>
        <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 640, margin: '0 auto' }}>Toàn bộ kiến trúc được tối ưu cho Poseidon Merkle Tree depth 10, hỗ trợ quy mô 1024 Voters minh bạch trên mạng lưới.</p>
      </motion.div>

      <div ref={containerRef} style={{ position: 'relative', minHeight: 480, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Animated Tree Canvas Canvas Background */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.8, zIndex: 1, pointerEvents: 'none' }}>
           <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
           <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, #050814 100%)' }} />
        </div>

        {/* 4 Steps Interactive Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, width: '100%', zIndex: 5, marginBottom: 40, maxWidth: 1000 }}>
          {architectureLayers.map((layer, idx) => (
            <div 
              key={layer.id} 
              onClick={() => setActiveLayer(idx)}
              style={{ 
                padding: 16, borderRadius: 16, background: activeLayer === idx ? `${layer.color}15` : 'rgba(10,14,39,0.85)', 
                border: `1px solid ${activeLayer === idx ? layer.color : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer', transition: 'all 0.3s ease', backdropFilter: 'blur(10px)',
                boxShadow: activeLayer === idx ? `0 0 20px ${layer.color}30` : 'none'
              }}
            >
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: `${layer.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     <layer.icon size={16} color={layer.color} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: activeLayer === idx ? '#fff' : C.textMuted, fontFamily: "'Orbitron',sans-serif" }}>Layer {layer.id}</div>
               </div>
               <div style={{ fontSize: 11, fontWeight: 600, color: activeLayer === idx ? layer.color : C.textMuted, lineHeight: 1.4 }}>{layer.title.split(': ')[1]}</div>
            </div>
          ))}
        </div>

        {/* Dynamic Detail Viewer */}
        <div style={{ width: '100%', maxWidth: 800, zIndex: 10, position: 'relative' }}>
          <AnimatePresence mode="wait">
            {architectureLayers.map((layer, idx) => {
               if (activeLayer !== idx) return null;
               return (
                 <motion.div
                   key={layer.id}
                   initial={{ opacity: 0, y: 20, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   exit={{ opacity: 0, y: -20, scale: 0.95 }}
                   transition={{ duration: 0.4, ease: "easeOut" }}
                   style={{ 
                     background: 'rgba(10,14,39,0.95)', border: `2px solid ${layer.color}50`, borderRadius: 24, padding: '32px 40px',
                     boxShadow: `0 20px 40px rgba(0,0,0,0.5), inset 0 0 40px ${layer.color}15`, backdropFilter: 'blur(20px)'
                   }}
                 >
                   <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                     <div style={{ width: 64, height: 64, borderRadius: 16, background: `${layer.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <layer.icon size={32} color={layer.color} />
                     </div>
                     <div>
                        <h3 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px', fontFamily: "'Orbitron',sans-serif" }}>{layer.title}</h3>
                        <div style={{ fontSize: 14, color: layer.color, fontWeight: 600, letterSpacing: 0.5 }}>ORCAVOTE PROTOCOL STACK</div>
                     </div>
                   </div>

                   <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                     {layer.items.map((item, i) => (
                       <motion.div 
                         key={i}
                         initial={{ opacity: 0, x: -20 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: 0.2 + (i * 0.1) }}
                         style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}
                       >
                         <ShieldCheck size={18} color={layer.color} style={{ flexShrink: 0 }} />
                         <span style={{ fontSize: 15, color: '#E2E8F0', lineHeight: 1.5 }}>{item}</span>
                       </motion.div>
                     ))}
                   </div>

                   {/* Terminal Decorator Based on Layer */}
                   <div style={{ marginTop: 24, padding: 16, background: '#050814', borderRadius: 12, border: '1px solid #1e293b', fontFamily: 'monospace', fontSize: 13, color: '#64748b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                         <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                         <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                         <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                         <span style={{ marginLeft: 8, fontSize: 11 }}>system_log.sh</span>
                      </div>
                      <div style={{ color: layer.color, opacity: 0.8 }}>
                        {idx === 0 && '> Generating Proof... [1024 Poseidon Hashes Evaluated]\n> Groth16 SnarkJS Verified: True'}
                        {idx === 1 && '> Walrus Push Object ID: 0x8b...32\n> Seal Policy Enforced: Dataset Privacy'}
                        {idx === 2 && '> Sui Tx MoveCall: vote::submit_proof\n> Nullifier Logged to Registry: OK'}
                        {idx === 3 && '> DApp Kit Connected\n> React State Synced: Poll Active'}
                      </div>
                   </div>
                 </motion.div>
               )
            })}
          </AnimatePresence>
        </div>

      </div>
    </section>
  )
}

import {
  Shield,
  Vote,
  Lock,
  Eye,
  Database,
  Users,
  ChevronRight,
  CheckCircle,
  Zap,
  ArrowRight,
  FileKey,
  ShieldCheck,
  Fingerprint,
  Network,
} from 'lucide-react'

/* ────────────────────────────────────────────
   Design tokens (inline)
   ──────────────────────────────────────────── */
const C = {
  bg: '#0A0E27',
  surface: '#111638',
  surfaceLight: '#1A1F4A',
  border: '#2A2F5A',
  borderLight: '#3B82F6',
  text: '#E0E0E0',
  textMuted: '#94A3B8',
  heading: '#FFFFFF',
  primary: '#3B82F6',
  primaryDark: '#1E40AF',
  accent: '#F59E0B',
  accentHover: '#D97706',
  green: '#10B981',
} as const

/* ────────────────────────────────────────────
   Navbar
   ──────────────────────────────────────────── */
function Navbar() {
  return (
    <nav
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        right: 16,
        zIndex: 50,
        maxWidth: 1152,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          background: 'rgba(10, 14, 39, 0.85)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <a
          href="#"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: C.heading,
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={18} color="#fff" />
          </div>
          OrcaVote
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['How it Works', 'Features', 'Use Cases'].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
              style={{
                textDecoration: 'none',
                color: C.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {label}
            </a>
          ))}
          <a
            href="#cta"
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              background: C.accent,
              color: '#000',
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  )
}

/* ────────────────────────────────────────────
   Hero
   ──────────────────────────────────────────── */
function Hero() {
  return (
    <section
      style={{
        paddingTop: 140,
        paddingBottom: 80,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow blobs */}
      <div
        style={{
          position: 'absolute',
          top: -100,
          left: '20%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'rgba(59, 130, 246, 0.08)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -60,
          right: '15%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(245, 158, 11, 0.06)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
        {/* Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            background: C.surface,
            marginBottom: 32,
          }}
        >
          <Lock size={14} color={C.primary} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>
            Privacy-Preserving Protocol on Sui
          </span>
        </div>

        <h1
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(32px, 5vw, 64px)',
            fontWeight: 700,
            lineHeight: 1.15,
            color: C.heading,
            margin: '0 0 24px',
          }}
        >
          Vote to Unlock
          <br />
          <span style={{ color: C.primary }}>Private Data</span>
        </h1>

        <p
          style={{
            fontSize: 18,
            lineHeight: 1.7,
            color: C.textMuted,
            maxWidth: 640,
            margin: '0 auto 40px',
          }}
        >
          OrcaVote releases sensitive datasets only when stakeholders vote to approve.
          Data stays encrypted on Walrus, votes are anonymous via ZK proofs,
          and all governance logic runs on-chain with Move.
        </p>

        {/* CTA buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <a
            href="#cta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 32px',
              borderRadius: 14,
              background: C.accent,
              color: '#000',
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Launch App
            <ArrowRight size={18} />
          </a>
          <a
            href="#how-it-works"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 32px',
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              background: 'transparent',
              color: C.text,
              fontSize: 16,
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            How It Works
          </a>
        </div>

        {/* Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            maxWidth: 600,
            margin: '56px auto 0',
          }}
        >
          {[
            { value: 'ZK Proofs', label: 'Anonymous Voting' },
            { value: 'Seal', label: 'End-to-End Encryption' },
            { value: 'Walrus', label: 'Decentralized Storage' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                padding: '20px 12px',
                borderRadius: 16,
                border: `1px solid ${C.border}`,
                background: C.surface,
              }}
            >
              <div
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.primary,
                  marginBottom: 4,
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 13, color: C.textMuted }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────
   How It Works
   ──────────────────────────────────────────── */
const steps = [
  {
    num: '01',
    icon: Database,
    title: 'Encrypt & Store',
    desc: 'Data Owner encrypts the dataset with Seal and uploads the ciphertext to Walrus. Only metadata is registered on-chain.',
  },
  {
    num: '02',
    icon: FileKey,
    title: 'Request Access',
    desc: 'A Requester creates an AccessRequest specifying purpose, threshold, and deadline. The request is recorded on Sui.',
  },
  {
    num: '03',
    icon: Fingerprint,
    title: 'Anonymous Vote',
    desc: 'Council members cast YES/NO votes using ZK proofs — proving membership without revealing identity.',
  },
  {
    num: '04',
    icon: ShieldCheck,
    title: 'Verify & Release',
    desc: 'Move contract verifies each Groth16 proof on-chain. If YES votes meet the threshold, Seal releases the decryption key.',
  },
]

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            background: C.surface,
            marginBottom: 16,
          }}
        >
          <Zap size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>How It Works</span>
        </div>
        <h2
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(24px, 3vw, 40px)',
            fontWeight: 700,
            color: C.heading,
            margin: '0 0 12px',
          }}
        >
          From Encrypted Data to Governed Release
        </h2>
        <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 560, margin: '0 auto' }}>
          Four steps. Fully on-chain. Zero trust required.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 24,
        }}
      >
        {steps.map((step) => (
          <div
            key={step.num}
            style={{
              padding: 28,
              borderRadius: 20,
              border: `1px solid ${C.border}`,
              background: C.surface,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 16,
                right: 20,
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 32,
                fontWeight: 700,
                color: 'rgba(59, 130, 246, 0.1)',
              }}
            >
              {step.num}
            </div>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: `rgba(59, 130, 246, 0.1)`,
                border: `1px solid rgba(59, 130, 246, 0.2)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <step.icon size={22} color={C.primary} />
            </div>
            <h3
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                color: C.heading,
                margin: '0 0 8px',
              }}
            >
              {step.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, margin: 0 }}>
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────
   Features
   ──────────────────────────────────────────── */
const features = [
  {
    icon: Fingerprint,
    title: 'ZK Anonymous Voting',
    desc: 'Semaphore-style circuits prove council membership and prevent double-voting without revealing voter identity.',
  },
  {
    icon: Lock,
    title: 'Seal Encryption',
    desc: 'Datasets are encrypted client-side with IBE. Decryption keys are only released when governance conditions are met.',
  },
  {
    icon: Database,
    title: 'Walrus Storage',
    desc: 'Ciphertext lives on Walrus — decentralized, censorship-resistant blob storage. On-chain stores only metadata.',
  },
  {
    icon: ShieldCheck,
    title: 'On-Chain Verification',
    desc: 'Groth16 proofs are verified directly in Move smart contracts. Every vote and tally is transparent and auditable.',
  },
  {
    icon: Vote,
    title: 'Threshold Governance',
    desc: 'Configurable YES/NO threshold, deadline, and council size. Deterministic finalization logic in Move.',
  },
  {
    icon: Network,
    title: 'Built on Sui',
    desc: 'Leverages Sui\'s object model, parallel execution, and low-latency finality for responsive governance.',
  },
]

function Features() {
  return (
    <section id="features" style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            background: C.surface,
            marginBottom: 16,
          }}
        >
          <Shield size={14} color={C.green} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Core Features</span>
        </div>
        <h2
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(24px, 3vw, 40px)',
            fontWeight: 700,
            color: C.heading,
            margin: '0 0 12px',
          }}
        >
          Privacy by Design
        </h2>
        <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 560, margin: '0 auto' }}>
          Every layer — encryption, voting, storage, verification — is built for zero-trust privacy.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 24,
        }}
      >
        {features.map((f) => (
          <div
            key={f.title}
            style={{
              padding: 28,
              borderRadius: 20,
              border: `1px solid ${C.border}`,
              background: C.surface,
              cursor: 'pointer',
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.borderLight)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: `rgba(59, 130, 246, 0.1)`,
                border: `1px solid rgba(59, 130, 246, 0.2)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <f.icon size={22} color={C.primary} />
            </div>
            <h3
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                color: C.heading,
                margin: '0 0 8px',
              }}
            >
              {f.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, margin: 0 }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────
   Use Cases
   ──────────────────────────────────────────── */
const useCases = [
  {
    icon: Eye,
    title: 'DAO Revenue Reports',
    desc: 'Let partners view detailed financial data only after council approval — no premature leaks.',
  },
  {
    icon: Database,
    title: 'AI Training Datasets',
    desc: 'Data DAOs can gate access to valuable training data behind stakeholder consensus.',
  },
  {
    icon: ShieldCheck,
    title: 'Security Audit Logs',
    desc: 'Auditors and regulators access sensitive system logs only when the governance council agrees.',
  },
]

function UseCases() {
  return (
    <section id="use-cases" style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            background: C.surface,
            marginBottom: 16,
          }}
        >
          <Users size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>Use Cases</span>
        </div>
        <h2
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(24px, 3vw, 40px)',
            fontWeight: 700,
            color: C.heading,
            margin: '0 0 12px',
          }}
        >
          Who Is OrcaVote For?
        </h2>
        <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 560, margin: '0 auto' }}>
          Any organization that needs governed, privacy-preserving data release.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 24,
        }}
      >
        {useCases.map((uc) => (
          <div
            key={uc.title}
            style={{
              padding: 32,
              borderRadius: 20,
              border: `1px solid ${C.border}`,
              background: C.surface,
              cursor: 'pointer',
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: `rgba(245, 158, 11, 0.1)`,
                border: `1px solid rgba(245, 158, 11, 0.2)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <uc.icon size={24} color={C.accent} />
            </div>
            <h3
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 18,
                fontWeight: 600,
                color: C.heading,
                margin: '0 0 10px',
              }}
            >
              {uc.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, margin: '0 0 16px' }}>
              {uc.desc}
            </p>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                color: C.accent,
                cursor: 'pointer',
              }}
            >
              Learn more <ChevronRight size={14} />
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────
   CTA
   ──────────────────────────────────────────── */
function CTA() {
  return (
    <section id="cta" style={{ padding: '80px 24px', maxWidth: 1152, margin: '0 auto' }}>
      <div
        style={{
          padding: 'clamp(40px, 6vw, 72px) clamp(24px, 4vw, 56px)',
          borderRadius: 24,
          border: `1px solid rgba(59, 130, 246, 0.3)`,
          background: `linear-gradient(135deg, ${C.primaryDark}, ${C.surface})`,
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative glow */}
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.15)',
            filter: 'blur(60px)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative' }}>
          <h2
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 'clamp(24px, 4vw, 44px)',
              fontWeight: 700,
              color: C.heading,
              margin: '0 0 16px',
            }}
          >
            Ready to Govern Your Data?
          </h2>
          <p
            style={{
              fontSize: 17,
              color: '#94A3B8',
              maxWidth: 520,
              margin: '0 auto 36px',
              lineHeight: 1.7,
            }}
          >
            Deploy OrcaVote on Sui and give your stakeholders privacy-preserving control
            over sensitive data release.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a
              href="#"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 32px',
                borderRadius: 14,
                background: C.accent,
                color: '#000',
                fontSize: 16,
                fontWeight: 700,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Launch App
              <ArrowRight size={18} />
            </a>
            <a
              href="#"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 32px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Read Docs
            </a>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              marginTop: 28,
              flexWrap: 'wrap',
            }}
          >
            {['Open source', 'On-chain verifiable', 'Zero-knowledge'].map((t) => (
              <span
                key={t}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  color: '#94A3B8',
                }}
              >
                <CheckCircle size={14} color={C.green} /> {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────
   Footer
   ──────────────────────────────────────────── */
function Footer() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${C.border}`,
        padding: '48px 24px',
        maxWidth: 1152,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 32,
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 16,
              color: C.heading,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={16} color="#fff" />
            </div>
            OrcaVote
          </div>
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
            Vote-to-unlock private data.
            <br />
            Built on Sui.
          </p>
        </div>

        {[
          {
            title: 'Protocol',
            links: ['Documentation', 'GitHub', 'Smart Contracts'],
          },
          {
            title: 'Stack',
            links: ['Sui Move', 'Seal', 'Walrus', 'Groth16'],
          },
          {
            title: 'Community',
            links: ['Discord', 'Twitter', 'Forum'],
          },
        ].map((col) => (
          <div key={col.title}>
            <h4
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                color: C.heading,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              {col.title}
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {col.links.map((link) => (
                <li key={link} style={{ marginBottom: 8 }}>
                  <a
                    href="#"
                    style={{
                      fontSize: 13,
                      color: C.textMuted,
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: `1px solid ${C.border}`,
          textAlign: 'center',
          fontSize: 13,
          color: C.textMuted,
        }}
      >
        Built for the Sui ecosystem
      </div>
    </footer>
  )
}

/* ────────────────────────────────────────────
   App
   ──────────────────────────────────────────── */
export default function App() {
  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <UseCases />
      <CTA />
      <Footer />
    </div>
  )
}
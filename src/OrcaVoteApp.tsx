import { useState } from 'react'
import {
  ConnectModal,
  useCurrentAccount,
  useDisconnectWallet,
} from '@mysten/dapp-kit'
import { Shield, Wallet, LogOut } from 'lucide-react'
import { C } from './theme'

/* ─── Wallet Button ─── */
function WalletButton() {
  const currentAccount = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()
  const [open, setOpen] = useState(false)

  if (currentAccount) {
    const addr = currentAccount.address
    const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            padding: '8px 16px', borderRadius: 10,
            border: `1px solid ${C.border}`, background: C.surface,
            fontSize: 13, fontWeight: 600, color: C.primary,
            fontFamily: "'Exo 2',sans-serif",
          }}
        >
          {short}
        </div>
        <button
          onClick={() => disconnect()}
          style={{
            padding: 8, borderRadius: 10,
            border: `1px solid ${C.border}`, background: 'transparent',
            color: C.textMuted, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}
          aria-label="Disconnect wallet"
        >
          <LogOut size={16} />
        </button>
      </div>
    )
  }

  return (
    <ConnectModal
      open={open}
      onOpenChange={(isOpen) => setOpen(isOpen)}
      trigger={
        <button
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 20px', borderRadius: 10,
            background: C.accent, color: '#000',
            fontSize: 14, fontWeight: 700, border: 'none',
            cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
          }}
        >
          <Wallet size={16} />
          Connect Wallet
        </button>
      }
    />
  )
}

/* ─── App Navbar ─── */
function AppNavbar() {
  return (
    <nav style={{ position: 'fixed', top: 16, left: 16, right: 16, zIndex: 50, maxWidth: 1152, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px', borderRadius: 16,
          border: `1px solid ${C.border}`, background: 'rgba(10,14,39,0.85)', backdropFilter: 'blur(12px)',
        }}
      >
        <a href="index.html" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.heading, fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: 18 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${C.primary},${C.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={18} color="#fff" />
          </div>
          OrcaVote
        </a>
        <WalletButton />
      </div>
    </nav>
  )
}

/* ─── Connected Dashboard Placeholder ─── */
function Dashboard() {
  const currentAccount = useCurrentAccount()

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
      {currentAccount ? (
        <div style={{ padding: 32, borderRadius: 20, border: `1px solid ${C.border}`, background: C.surface }}>
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 20, fontWeight: 600, color: C.heading, margin: '0 0 16px' }}>
            Welcome, Voter
          </h2>
          <div style={{ padding: 16, borderRadius: 12, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Connected Address</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, fontFamily: "'Exo 2',monospace", wordBreak: 'break-all' }}>
              {currentAccount.address}
            </div>
          </div>
          <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7 }}>
            Your wallet is connected. You can now participate in governance votes,
            request access to encrypted datasets, and manage your data assets.
          </p>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: `rgba(59,130,246,0.1)`, border: `1px solid rgba(59,130,246,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Wallet size={36} color={C.primary} />
          </div>
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 24, fontWeight: 700, color: C.heading, margin: '0 0 12px' }}>
            Connect Your Wallet
          </h2>
          <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 400, margin: '0 auto 32px', lineHeight: 1.7 }}>
            Connect a Sui wallet to access the OrcaVote governance dashboard, cast anonymous votes, and manage data assets.
          </p>
          <WalletButton />
        </div>
      )}
    </div>
  )
}

/* ─── OrcaVote App ─── */
export default function OrcaVoteApp() {
  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <AppNavbar />
      <main style={{ paddingTop: 120, paddingBottom: 80 }}>
        <Dashboard />
      </main>
    </div>
  )
}

import { useState, useRef, useEffect, forwardRef } from 'react'
import {
  ConnectModal,
  useCurrentAccount,
  useDisconnectWallet,
  useSuiClientContext,
  useSuiClientQuery,
  useResolveSuiNSName,
} from '@mysten/dapp-kit'
import {
  Shield,
  Wallet,
  LogOut,
  ChevronDown,
  Globe,
  X,
  Copy,
  Check,
  AtSign,
  Database,
  Vote,
  List,
} from 'lucide-react'
import { C } from './theme'
import DataAssetPanel from './DataAssetPanel'
import ZkMerklePanel from './ZkMerklePanel'
import PollListPanel from './PollListPanel'
import PollDetailPanel from './PollDetailPanel'
import type { PollInfo } from './poll-transactions'

/* ─── helpers ─── */
function formatBalance(raw: string, decimals = 9): string {
  const n = Number(raw) / 10 ** decimals
  if (n === 0) return '0'
  if (n < 0.001) return '<0.001'
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function shortCoinType(coinType: string): string {
  const parts = coinType.split('::')
  return parts[parts.length - 1] ?? coinType
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/* ─── Network Selector ─── */
function NetworkSelector() {
  const ctx = useSuiClientContext()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = ctx.network ?? 'testnet'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 10,
          border: `1px solid ${C.border}`, background: C.surface,
          color: C.text, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
        }}
      >
        <Globe size={14} color={current === 'mainnet' ? C.green : C.accent} />
        {current}
        <ChevronDown size={14} style={{ opacity: 0.5 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8,
            minWidth: 160, borderRadius: 12,
            border: `1px solid ${C.border}`, background: C.surface,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            overflow: 'hidden', zIndex: 100,
          }}
        >
          {Object.keys(ctx.networks).map((net) => (
            <button
              key={net}
              onClick={() => { ctx.selectNetwork(net); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '10px 16px',
                border: 'none', background: net === current ? C.bg : 'transparent',
                color: net === current ? C.primary : C.text,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Exo 2',sans-serif",
                textAlign: 'left',
              }}
            >
              <Globe size={14} color={net === 'mainnet' ? C.green : C.accent} />
              {net}
              {net === current && <Check size={14} color={C.primary} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Wallet Panel (token list) ─── */
function WalletPanel({ onClose }: { onClose: () => void }) {
  const currentAccount = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()
  const [copied, setCopied] = useState(false)

  const { data: suiNSName } = useResolveSuiNSName(currentAccount?.address)

  const { data: balances, isPending } = useSuiClientQuery(
    'getAllBalances',
    { owner: currentAccount?.address ?? '' },
    { enabled: !!currentAccount },
  )

  if (!currentAccount) return null

  const addr = currentAccount.address

  function copyAddr() {
    navigator.clipboard.writeText(addr)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 8,
        width: 340, borderRadius: 16,
        border: `1px solid ${C.border}`, background: C.surface,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        zIndex: 100, overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>Wallet</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', display: 'flex', padding: 4 }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {suiNSName && (
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AtSign size={14} color={C.accent} />
          <span style={{ fontSize: 15, fontWeight: 700, color: C.accent, fontFamily: "'Exo 2',sans-serif" }}>{suiNSName}</span>
        </div>
      )}

      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Address</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, fontFamily: "'Exo 2',monospace", wordBreak: 'break-all', flex: 1 }}>{addr}</div>
          <button onClick={copyAddr} style={{ background: 'none', border: 'none', color: copied ? C.green : C.textMuted, cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }} aria-label="Copy address">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 20px' }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Tokens</div>
        {isPending && <div style={{ fontSize: 13, color: C.textMuted, padding: '8px 0' }}>Loading balances…</div>}
        {balances && balances.length === 0 && <div style={{ fontSize: 13, color: C.textMuted, padding: '8px 0' }}>No tokens found</div>}
        {balances && balances.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
            {balances.map((b) => (
              <div key={b.coinType} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.heading }}>{shortCoinType(b.coinType)}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'Exo 2',monospace", marginTop: 2 }}>{shortAddr(b.coinType.split('::')[0] ?? '')}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Exo 2',sans-serif" }}>{formatBalance(b.totalBalance)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}` }}>
        <button onClick={() => { disconnect(); onClose() }} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '10px 0', borderRadius: 10,
          border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.08)',
          color: '#EF4444', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
        }}>
          <LogOut size={14} /> Disconnect
        </button>
      </div>
    </div>
  )
}

/* ─── Wallet Button (connected state) ─── */
const WalletButtonConnected = forwardRef<
  HTMLDivElement,
  { address: string; panelOpen: boolean; setPanelOpen: (v: boolean) => void }
>(function WalletButtonConnected({ address, panelOpen, setPanelOpen }, ref) {
  const { data: suiNSName } = useResolveSuiNSName(address)
  const displayName = suiNSName ?? shortAddr(address)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setPanelOpen(!panelOpen)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 10,
        border: `1px solid ${C.border}`, background: C.surface,
        fontSize: 13, fontWeight: 600, color: suiNSName ? C.accent : C.primary,
        cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {suiNSName ? <AtSign size={14} /> : <Wallet size={14} />}
        {displayName}
        <ChevronDown size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
      </button>
      {panelOpen && <WalletPanel onClose={() => setPanelOpen(false)} />}
    </div>
  )
})

/* ─── Wallet Button ─── */
function WalletButton() {
  const currentAccount = useCurrentAccount()
  const [connectOpen, setConnectOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPanelOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (currentAccount) {
    return <WalletButtonConnected address={currentAccount.address} panelOpen={panelOpen} setPanelOpen={setPanelOpen} ref={ref} />
  }

  return (
    <ConnectModal
      open={connectOpen}
      onOpenChange={(isOpen) => setConnectOpen(isOpen)}
      trigger={
        <button style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 20px', borderRadius: 10,
          background: C.accent, color: '#000',
          fontSize: 14, fontWeight: 700, border: 'none',
          cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
        }}>
          <Wallet size={16} /> Connect Wallet
        </button>
      }
    />
  )
}

/* ─── Tab definitions ─── */
const TABS = [
  { key: 'data-asset', label: 'Data Asset', icon: Database },
  { key: 'create-poll', label: 'Tạo Poll', icon: Vote },
  { key: 'polls', label: 'Polls', icon: List },
] as const

type TabKey = (typeof TABS)[number]['key']

/* ─── App Navbar ─── */
function AppNavbar({ activeTab, setActiveTab }: { activeTab: TabKey; setActiveTab: (t: TabKey) => void }) {
  return (
    <nav style={{ position: 'fixed', top: 16, left: 16, right: 16, zIndex: 50, maxWidth: 1152, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderRadius: 16,
        border: `1px solid ${C.border}`, background: 'rgba(10,14,39,0.85)', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="index.html" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.heading, fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: 18 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${C.primary},${C.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={18} color="#fff" />
            </div>
            OrcaVote
          </a>

          {/* Tabs in navbar */}
          <div style={{ display: 'flex', gap: 4, background: C.bg, borderRadius: 10, padding: 3 }}>
            {TABS.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 8,
                    border: 'none',
                    background: active ? C.surface : 'transparent',
                    color: active ? C.heading : C.textMuted,
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NetworkSelector />
          <WalletButton />
        </div>
      </div>
    </nav>
  )
}

/* ─── Dashboard ─── */
function Dashboard({ activeTab, setActiveTab }: { activeTab: TabKey; setActiveTab: (t: TabKey) => void }) {
  const currentAccount = useCurrentAccount()
  const [selectedPoll, setSelectedPoll] = useState<PollInfo | null>(null)

  // Reset selected poll when switching away from polls tab
  const prevTab = useRef(activeTab)
  useEffect(() => {
    if (prevTab.current === 'polls' && activeTab !== 'polls') {
      setSelectedPoll(null)
    }
    prevTab.current = activeTab
  }, [activeTab])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
      {currentAccount ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {activeTab === 'data-asset' && <DataAssetPanel />}
          {activeTab === 'create-poll' && <ZkMerklePanel onNavigateToPoll={(pollId) => {
            setSelectedPoll({
              pollId,
              title: '',
              status: 1,
              threshold: 0,
              totalVoters: 0,
              yesCount: 0,
              noCount: 0,
              votingEnd: 0,
              admin: '',
              councilRoot: '',
            })
            setActiveTab('polls')
          }} />}
          {activeTab === 'polls' && !selectedPoll && (
            <PollListPanel onSelectPoll={setSelectedPoll} />
          )}
          {activeTab === 'polls' && selectedPoll && (
            <PollDetailPanel poll={selectedPoll} onBack={() => setSelectedPoll(null)} />
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
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
  const [activeTab, setActiveTab] = useState<TabKey>('data-asset')

  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <AppNavbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main style={{ paddingTop: 120, paddingBottom: 80 }}>
        <Dashboard activeTab={activeTab} setActiveTab={setActiveTab} />
      </main>
    </div>
  )
}

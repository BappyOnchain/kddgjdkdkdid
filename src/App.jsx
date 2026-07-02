import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { ethers } from 'ethers'
import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { sepolia } from '@reown/appkit/networks'

/* ════════════════════════════════════════════════════════════
   CONFIG
   ════════════════════════════════════════════════════════════ */

const REOWN_PROJECT_ID = '1724feb47aaa94102743462f8a84e693'
const CONTRACT_ADDRESS = '0x9bD14eA64dEA9b130f7978b1D0498cc013427EBB'
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const USDC_LOGO = 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png'
const SEPOLIA_CHAIN_ID = 11155111
const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7'
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io'

/* ── Reown AppKit init (runs once at module load) ── */
const ethersAdapter = new EthersAdapter()
const appKit = createAppKit({
  adapters: [ethersAdapter],
  networks: [sepolia],
  defaultNetwork: sepolia,
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'StakingProtocol',
    description: 'Professional ERC20 Staking Protocol by BappyOnchain',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://staking-dapp.vercel.app',
    icons: ['https://assets.coingecko.com/coins/images/6319/standard/usdc.png'],
  },
  features: { analytics: false, email: false, socials: false },
  themeVariables: {
    '--w3m-color-mix': '#00F0FF',
    '--w3m-color-mix-strength': 20,
    '--w3m-accent': '#00F0FF',
    '--w3m-border-radius-master': '8px',
    '--w3m-z-index': 300,
  },
})

const STAKING_ABI = [
  'function totalStaked() external view returns (uint256)',
  'function stakedBalance(address account) external view returns (uint256)',
  'function earned(address account) external view returns (uint256)',
  'function currentAPR() external view returns (uint256)',
  'function remainingTime() external view returns (uint256)',
  'function rewardRate() external view returns (uint256)',
  'function periodFinish() external view returns (uint256)',
  'function paused() external view returns (bool)',
  'function stakingToken() external view returns (address)',
  'function rewardToken() external view returns (address)',
  'function protocolStats() external view returns (uint256 _totalStaked, uint256 _rewardRate, uint256 _periodFinish, uint256 _rewardPerToken, bool _paused)',
  'function userStats(address account) external view returns (uint256 _staked, uint256 _earned, uint256 _rewardPerTokenPaid)',
  'function stake(uint256 amount) external',
  'function withdraw(uint256 amount) external',
  'function claimReward() external',
  'function exit() external',
  'function emergencyWithdraw() external',
  'event Staked(address indexed user, uint256 amount)',
  'event Withdrawn(address indexed user, uint256 amount)',
  'event RewardClaimed(address indexed user, uint256 reward)',
]

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
]

/* ════════════════════════════════════════════════════════════
   UTILS
   ════════════════════════════════════════════════════════════ */

const shortenAddress = (addr) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '')

const formatTokenAmount = (amount, decimals = 18, displayDecimals = 2) => {
  if (amount === undefined || amount === null) return '0'
  try {
    const formatted = ethers.formatUnits(amount, decimals)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.01) return '<0.01'
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return num.toLocaleString('en-US', { maximumFractionDigits: displayDecimals })
  } catch {
    return '0'
  }
}

const formatAPR = (aprBps) => {
  if (!aprBps) return '0.00'
  return (Number(aprBps) / 100).toFixed(2)
}

const parseTokenAmount = (value, decimals = 18) => {
  try {
    return ethers.parseUnits(value.toString(), decimals)
  } catch {
    return 0n
  }
}

/* ════════════════════════════════════════════════════════════
   TOAST SYSTEM
   ════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════
   TX OVERLAY (loading animation during transactions)
   ════════════════════════════════════════════════════════════ */

const TxContext = createContext(null)

const TxOverlay = ({ tx, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-dark-card border border-dark-border shadow-2xl p-8 flex flex-col items-center gap-5">

      {/* close button */}
      {tx.status !== 'pending' && (
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}

      {/* spinner or success icon */}
      {tx.status === 'pending' ? (
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 animate-spin" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="34" stroke="#1E2433" strokeWidth="6" />
            <circle cx="40" cy="40" r="34" stroke="url(#spinGrad)" strokeWidth="6" strokeLinecap="round" strokeDasharray="213" strokeDashoffset="160" />
            <defs>
              <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00F0FF" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="none" stroke="#00F0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <circle cx="10" cy="10" r="7.25" />
              <path d="M10 6v4l2.5 1.5" />
            </svg>
          </div>
        </div>
      ) : (
        <div className="w-20 h-20 rounded-full bg-green-400/10 flex items-center justify-center">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-10 h-10 text-green-400">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* message */}
      <div className="text-center">
        <p className="text-base font-semibold text-white mb-1">{tx.message}</p>
        <p className="text-xs text-gray-500">
          {tx.status === 'pending' ? 'Please wait, do not close this page...' : 'Transaction confirmed!'}
        </p>
      </div>

      {/* tx hash link */}
      {tx.hash && (
        <a href={`${SEPOLIA_EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-bg border border-dark-border hover:border-cyan-400/50 transition-colors w-full justify-center">
          <span className="text-xs text-gray-400 font-mono truncate">{tx.hash.slice(0, 12)}...{tx.hash.slice(-8)}</span>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
          </svg>
          <span className="text-xs text-cyan-400 font-semibold flex-shrink-0">Etherscan ↗</span>
        </a>
      )}
    </div>
  </div>
)

const TxProvider = ({ children }) => {
  const [tx, setTx] = useState(null)

  const showTx = useCallback((message, hash) => {
    setTx({ message, hash, status: 'pending' })
  }, [])

  const successTx = useCallback((message, hash) => {
    setTx({ message, hash, status: 'success' })
    setTimeout(() => setTx(null), 4000)
  }, [])

  const errorTx = useCallback(() => {
    setTx(null)
  }, [])

  const clearTx = useCallback(() => setTx(null), [])

  return (
    <TxContext.Provider value={{ showTx, successTx, errorTx, clearTx }}>
      {children}
      {tx && <TxOverlay tx={tx} onClose={clearTx} />}
    </TxContext.Provider>
  )
}

const useTx = () => {
  const ctx = useContext(TxContext)
  if (!ctx) throw new Error('useTx must be within TxProvider')
  return ctx
}

const ToastContext = createContext(null)
let toastIdCounter = 0

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', txHash = null, duration = 5000) => {
    const id = ++toastIdCounter
    setToasts((prev) => [...prev, { id, message, type, txHash }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration)
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[90vw] sm:max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const TOAST_ICONS = {
  success: <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />,
  error: <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />,
  info: <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />,
}

const TOAST_COLORS = { success: 'text-green-400', error: 'text-red-400', info: 'text-cyan-400', pending: 'text-yellow-400' }

const ToastItem = ({ toast, onRemove }) => (
  <div className="toast-enter pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl bg-dark-card border border-dark-border shadow-2xl backdrop-blur-md">
    <div className="flex-shrink-0 mt-0.5">
      {toast.type === 'pending' ? (
        <svg className={`w-5 h-5 ${TOAST_COLORS.pending} animate-spin`} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${TOAST_COLORS[toast.type]}`}>
          {TOAST_ICONS[toast.type] || TOAST_ICONS.info}
        </svg>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm text-white font-medium leading-snug">{toast.message}</p>
      {toast.txHash && (
        <a href={`${SEPOLIA_EXPLORER}/tx/${toast.txHash}`} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 mt-1 inline-block truncate">
          View on Etherscan ↗
        </a>
      )}
    </div>
    <button onClick={() => onRemove(toast.id)} className="flex-shrink-0 text-gray-500 hover:text-white transition-colors">
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
      </svg>
    </button>
  </div>
)

/* ════════════════════════════════════════════════════════════
   THEME HOOK
   ════════════════════════════════════════════════════════════ */

const useTheme = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('staking-theme') || 'dark')

  useEffect(() => {
    localStorage.setItem('staking-theme', theme)
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  return { theme, toggleTheme }
}

/* ════════════════════════════════════════════════════════════
   WALLET + CONTRACT HOOK
   ════════════════════════════════════════════════════════════ */

const useStaking = () => {
  const { addToast } = useToast()
  const { showTx, successTx, errorTx } = useTx()
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [contract, setContract] = useState(null)
  const [connecting, setConnecting] = useState(false)

  const [stats, setStats] = useState({
    totalStaked: 0n,
    apr: 0n,
    userStaked: 0n,
    userEarned: 0n,
    remainingTime: 0n,
    periodFinish: 0n,
    rewardRate: 0n,
    allowance: 0n,
    usdcBalance: 0n,
    decimals: 6,
    symbol: 'USDC',
  })
  const [loadingStats, setLoadingStats] = useState(false)
  const [approving, setApproving] = useState(false)

  const isCorrectNetwork = chainId === SEPOLIA_CHAIN_ID

  /* ── Build read-only contract for stats even without wallet connected ── */
  const fetchStatsPublic = useCallback(async (addr) => {
    try {
      const roProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
      const roContract = new ethers.Contract(CONTRACT_ADDRESS, STAKING_ABI, roProvider)
      const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, roProvider)

      const [totalStaked, apr, remainingTime] = await Promise.all([
        roContract.totalStaked(),
        roContract.currentAPR(),
        roContract.remainingTime(),
      ])

      let userStaked = 0n
      let userEarned = 0n
      let allowance = 0n
      let usdcBalance = 0n
      if (addr) {
        ;[userStaked, userEarned, allowance, usdcBalance] = await Promise.all([
          roContract.stakedBalance(addr),
          roContract.earned(addr),
          usdcContract.allowance(addr, CONTRACT_ADDRESS),
          usdcContract.balanceOf(addr),
        ])
      }

      setStats((prev) => ({
        ...prev,
        totalStaked,
        apr,
        remainingTime,
        userStaked,
        userEarned,
        allowance,
        usdcBalance,
      }))
    } catch (err) {
      console.error('Stats fetch error:', err)
    }
  }, [])

  /* ── Connect via Reown AppKit modal ── */
  const connectWallet = useCallback(async () => {
    try {
      await appKit.open()
    } catch (err) {
      console.error(err)
      addToast('Failed to open wallet modal', 'error')
    }
  }, [addToast])

  const disconnectWallet = useCallback(async () => {
    try {
      await appKit.disconnect()
    } catch (err) {
      console.error(err)
    }
    setAccount(null)
    setSigner(null)
    setContract(null)
    setChainId(null)
    addToast('Wallet disconnected', 'info')
  }, [addToast])

  /* ── Subscribe to Reown AppKit state changes ── */
  const connectedRef = useRef(false)
  const addToastRef = useRef(null)
  addToastRef.current = addToast

  useEffect(() => {
    const unsub = appKit.subscribeAccount(async (state) => {
      const addr = state?.address
      const status = state?.status

      if (status === 'connected' && addr) {
        if (connectedRef.current === addr) return
        connectedRef.current = addr
        try {
          const walletProvider = appKit.getWalletProvider()
          if (!walletProvider) return
          const browserProvider = new ethers.BrowserProvider(walletProvider)
          const network = await browserProvider.getNetwork()
          const signerObj = await browserProvider.getSigner()
          const stakingContract = new ethers.Contract(CONTRACT_ADDRESS, STAKING_ABI, signerObj)

          setAccount(addr)
          setChainId(Number(network.chainId))
          setProvider(browserProvider)
          setSigner(signerObj)
          setContract(stakingContract)
          addToastRef.current('Wallet connected!', 'success')
          // Fetch immediately and again after 2s to ensure balance loads
          fetchStatsPublic(addr)
          setTimeout(() => fetchStatsPublic(addr), 2000)
        } catch (err) {
          console.error('AppKit state error:', err)
        }
      } else if (status === 'disconnected' && connectedRef.current) {
        connectedRef.current = false
        setAccount(null)
        setSigner(null)
        setContract(null)
        setChainId(null)
      }
    })
    return () => unsub?.()
  }, [])

  /* ── Subscribe to network changes ── */
  useEffect(() => {
    const unsub = appKit.subscribeNetwork((network) => {
      if (network?.chainId) setChainId(Number(network.chainId))
    })
    return () => unsub?.()
  }, [])

  /* ── Poll stats every 15s ── */
  useEffect(() => {
    fetchStatsPublic(account)
    const interval = setInterval(() => fetchStatsPublic(account), 15000)
    return () => clearInterval(interval)
  }, [account, fetchStatsPublic])

  /* ── Transaction wrapper with overlay feedback ── */
  const sendTx = useCallback(
    async (fn, successMsg) => {
      try {
        const tx = await fn()
        showTx('Transaction Submitted', tx.hash)
        const receipt = await tx.wait()
        successTx(successMsg, receipt.hash)
        await fetchStatsPublic(account)
        return receipt
      } catch (err) {
        console.error(err)
        errorTx()
        if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
          addToast('Transaction rejected', 'error')
        } else {
          addToast(err.shortMessage || err.reason || 'Transaction failed', 'error')
        }
        throw err
      }
    },
    [account, addToast, fetchStatsPublic, showTx, successTx, errorTx]
  )

  const approveAndStake = useCallback(
    async (amount, decimals = 6) => {
      if (!signer) return addToast('Connect wallet first', 'error')
      setApproving(true)
      try {
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer)
        const parsedAmount = parseTokenAmount(amount, decimals)
        // Approve exact amount only — safer, no unlimited approval
        const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, parsedAmount)
        showTx('Step 1/2: Approving USDC...', approveTx.hash)
        await approveTx.wait()
        addToast('Approved! Staking now...', 'success')
        await fetchStatsPublic(account)
        // Auto stake immediately after approval
        const stakingContract = new ethers.Contract(CONTRACT_ADDRESS, STAKING_ABI, signer)
        const stakeTx = await stakingContract.stake(parsedAmount)
        showTx('Step 2/2: Staking USDC...', stakeTx.hash)
        const receipt = await stakeTx.wait()
        successTx('Staked successfully!', receipt.hash)
        await fetchStatsPublic(account)
      } catch (err) {
        console.error(err)
        errorTx()
        if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
          addToast('Transaction rejected', 'error')
        } else {
          addToast(err.shortMessage || err.reason || 'Failed', 'error')
        }
        throw err
      } finally {
        setApproving(false)
      }
    },
    [signer, account, addToast, fetchStatsPublic, showTx, successTx, errorTx]
  )

  const stake = useCallback(
    (amount, decimals = 6) => {
      if (!contract) return addToast('Connect wallet first', 'error')
      const parsedAmount = parseTokenAmount(amount, decimals)
      return sendTx(() => contract.stake(parsedAmount), 'Staked successfully!')
    },
    [contract, sendTx, addToast]
  )

  const withdraw = useCallback(
    (amount, decimals = 6) => {
      if (!contract) return addToast('Connect wallet first', 'error')
      const parsedAmount = parseTokenAmount(amount, decimals)
      return sendTx(() => contract.withdraw(parsedAmount), 'Unstaked successfully!')
    },
    [contract, sendTx, addToast]
  )

  const claimReward = useCallback(() => {
    if (!contract) return addToast('Connect wallet first', 'error')
    return sendTx(() => contract.claimReward(), 'Rewards claimed!')
  }, [contract, sendTx, addToast])

  const exit = useCallback(() => {
    if (!contract) return addToast('Connect wallet first', 'error')
    return sendTx(() => contract.exit(), 'Exited successfully — stake + rewards withdrawn!')
  }, [contract, sendTx, addToast])

  const emergencyWithdraw = useCallback(() => {
    if (!contract) return addToast('Connect wallet first', 'error')
    return sendTx(() => contract.emergencyWithdraw(), 'Emergency withdrawal complete')
  }, [contract, sendTx, addToast])

  return {
    account,
    chainId,
    isCorrectNetwork,
    connecting,
    connectWallet,
    disconnectWallet,
    stats,
    loadingStats,
    approving,
    approveAndStake,
    stake,
    withdraw,
    claimReward,
    exit,
    emergencyWithdraw,
  }
}

/* ════════════════════════════════════════════════════════════
   ICONS (inline SVG only)
   ════════════════════════════════════════════════════════════ */

const Icon = {
  grid: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" /></svg>
  ),
  deposit: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" /></svg>
  ),
  gift: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M5 8a2 2 0 100-4 2 2 0 000 4zM15 8a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1h4a1 1 0 011 1v3a1 1 0 01-1 1v6a2 2 0 01-2 2H7a2 2 0 01-2-2V9a1 1 0 01-1-1V5a1 1 0 011-1h4V3a1 1 0 011-1zM5 6v2h10V6H5zm1 4v6h8v-6H6z" clipRule="evenodd" /></svg>
  ),
  chart: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-6 4 3 5-8M17 6h-4v4" /></svg>
  ),
  gear: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
  ),
  coins: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 100 12 6 6 0 000-12zM2 12.5a1 1 0 011-1c.523 0 1.04.04 1.546.117a7.99 7.99 0 003.114 3.114c.077.506.117 1.023.117 1.546a1 1 0 01-1 1A6.5 6.5 0 012 12.5z" /></svg>
  ),
  trending: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l4-4 3 3 7-7M17 5h-4v4" /></svg>
  ),
  clock: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7.25" /><path d="M10 6v4l2.5 1.5" /></svg>
  ),
  bell: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.07c1.42.34 2.872.566 4.342.677a3 3 0 005.8 0c1.47-.111 2.922-.337 4.342-.678a.75.75 0 00.515-1.069A11.448 11.448 0 0116 8a6 6 0 00-6-6zM8.05 14.943a23.94 23.94 0 003.9 0 1.5 1.5 0 01-3.9 0z" /></svg>
  ),
  sun: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zM4.166 13.95a1 1 0 001.415-1.414l-.708-.707a1 1 0 10-1.414 1.414l.707.707zM4 11a1 1 0 100-2H3a1 1 0 100 2h1zm.166-7.95a1 1 0 011.415 0l.707.707A1 1 0 014.873 5.17l-.707-.707a1 1 0 010-1.414zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" /></svg>
  ),
  moon: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
  ),
  copy: (c = 'w-4 h-4') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" /></svg>
  ),
  explorer: (c = 'w-4 h-4') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" /></svg>
  ),
  logout: (c = 'w-4 h-4') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" /><path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" /></svg>
  ),
  menu: (c = 'w-6 h-6') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
  ),
  close: (c = 'w-6 h-6') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
  ),
  warning: (c = 'w-5 h-5') => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
  ),
}

/* ════════════════════════════════════════════════════════════
   SIDEBAR
   ════════════════════════════════════════════════════════════ */

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'stake', label: 'Stake', icon: 'deposit' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
]

const Sidebar = ({ active, setActive, mobileOpen, setMobileOpen }) => (
  <>
    {mobileOpen && (
      <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
    )}
    <aside
      className={`fixed lg:static top-0 left-0 h-full w-[270px] bg-dark-sidebar border-r border-dark-border z-50 transform transition-transform duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center font-bold text-dark-bg text-sm">
            S
          </div>
          <span className="font-semibold text-lg tracking-tight">StakingProtocol</span>
        </div>
        <button className="lg:hidden text-gray-400" onClick={() => setMobileOpen(false)}>
          {Icon.close()}
        </button>
      </div>

      <nav className="px-3 mt-4 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => {
                setActive(item.id)
                setMobileOpen(false)
              }}
              className={`relative flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'text-cyan-400 bg-cyan-400/5' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-cyan-400 to-violet-500" />}
              {Icon[item.icon]()}
              {item.label}
            </button>
          )
        })}
      </nav>
    </aside>
  </>
)

/* ════════════════════════════════════════════════════════════
   TOP BAR
   ════════════════════════════════════════════════════════════ */

const WalletPill = ({ account, connecting, connectWallet, disconnectWallet, isCorrectNetwork }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const copyAddress = () => {
    navigator.clipboard.writeText(account)
    setDropdownOpen(false)
  }

  if (!account) {
    return (
      <button
        onClick={connectWallet}
        disabled={connecting}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-dark-card border border-dark-border hover:border-cyan-400/50 transition-colors text-sm font-medium disabled:opacity-60 whitespace-nowrap"
      >
        {connecting ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <span className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" />
        )}
        <span className="text-sm">{connecting ? 'Connecting...' : 'Wallet connect'}</span>
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setDropdownOpen((o) => !o)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full bg-dark-card border ${
          isCorrectNetwork ? 'border-dark-border' : 'border-red-500/50'
        } hover:border-cyan-400/50 transition-colors text-sm font-medium`}
      >
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400"></span>
        </span>
        <span className="text-sm font-mono">{shortenAddress(account)}</span>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-52 rounded-xl bg-dark-card border border-dark-border shadow-2xl overflow-hidden z-50">
          {!isCorrectNetwork && (
            <div className="px-4 py-2.5 text-xs text-red-400 bg-red-400/10 border-b border-dark-border flex items-center gap-1.5">
              {Icon.warning('w-3.5 h-3.5')} Wrong network
            </div>
          )}
          <button onClick={copyAddress} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors text-left">
            {Icon.copy()} Copy Address
          </button>
          <a
            href={`${SEPOLIA_EXPLORER}/address/${account}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors"
          >
            {Icon.explorer()} View on Explorer
          </a>
          <button
            onClick={() => {
              disconnectWallet()
              setDropdownOpen(false)
            }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-400/10 transition-colors text-left border-t border-dark-border"
          >
            {Icon.logout()} Disconnect
          </button>
        </div>
      )}
    </div>
  )
}

const TopBar = ({ title, staking, theme, toggleTheme, setMobileOpen }) => (
  <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <button className="lg:hidden text-gray-300 flex-shrink-0" onClick={() => setMobileOpen(true)}>
        {Icon.menu()}
      </button>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{title}</h1>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        onClick={toggleTheme}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-dark-card border border-dark-border hover:border-cyan-400/50 transition-colors text-gray-300 flex-shrink-0"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? Icon.moon() : Icon.sun()}
      </button>
      <WalletPill
        account={staking.account}
        connecting={staking.connecting}
        connectWallet={staking.connectWallet}
        disconnectWallet={staking.disconnectWallet}
        isCorrectNetwork={staking.isCorrectNetwork}
      />
      <button className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full bg-dark-card border border-dark-border text-gray-300 hover:border-cyan-400/50 transition-colors flex-shrink-0">
        {Icon.bell()}
      </button>
    </div>
  </div>
)

/* ════════════════════════════════════════════════════════════
   STATS CARDS
   ════════════════════════════════════════════════════════════ */

const StatCard = ({ label, icon, value, unit, showLogo }) => (
  <div className="gradient-border glow-cyan relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-5 sm:p-6">
    <div className="flex items-start justify-between mb-6">
      <span className="text-sm text-gray-400 font-medium">{label}</span>
      <span className="text-cyan-400">{icon}</span>
    </div>
    <div className="flex items-baseline gap-2">
      {showLogo && <img src={USDC_LOGO} alt="USDC" className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex-shrink-0" />}
      <span className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</span>
      {unit && <span className="text-xs text-gray-500 font-semibold tracking-wide">{unit}</span>}
    </div>
  </div>
)

const StatsRow = ({ stats }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mb-6 sm:mb-8">
    <StatCard label="Total Staked" icon={Icon.coins('w-5 h-5')} value={formatTokenAmount(stats.totalStaked, stats.decimals)} unit={stats.symbol} showLogo />
    <StatCard label="Current APR" icon={Icon.trending('w-5 h-5')} value={`${formatAPR(stats.apr)}%`} />
    <StatCard label="Your Rewards" icon={Icon.gift('w-5 h-5')} value={formatTokenAmount(stats.userEarned, stats.decimals)} unit={stats.symbol} showLogo />
  </div>
)

/* ════════════════════════════════════════════════════════════
   PROGRESS RING
   ════════════════════════════════════════════════════════════ */

const ProgressRing = ({ stats }) => {
  const radius = 60
  const circumference = 2 * Math.PI * radius

  const progress = (() => {
    if (!stats.periodFinish || stats.periodFinish === 0n) return 0
    const remaining = Number(stats.remainingTime)
    const total = 30 * 24 * 60 * 60 // assume 30-day reference period for visual
    const elapsed = Math.max(0, total - remaining)
    return Math.min(100, (elapsed / total) * 100)
  })()

  const offset = circumference - (progress / 100) * circumference

  const formatTime = (seconds) => {
    const s = Number(seconds)
    if (s <= 0) return 'Ended'
    const days = Math.floor(s / 86400)
    const hours = Math.floor((s % 86400) / 3600)
    if (days > 0) return `${days}d ${hours}h`
    const minutes = Math.floor((s % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="gradient-border glow-violet relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6 flex flex-col items-center justify-center min-w-[200px]">
      <div className="relative w-[150px] h-[150px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r={radius} fill="none" stroke="#1E2433" strokeWidth="10" />
          <circle
            cx="75"
            cy="75"
            r={radius}
            fill="none"
            stroke="url(#ringGradient)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
          <defs>
            <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00F0FF" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-cyan-400">{Icon.clock('w-7 h-7')}</div>
      </div>
      <p className="mt-4 text-sm text-gray-400 text-center">Reward period ends in</p>
      <p className="text-sm font-semibold text-white">{formatTime(stats.remainingTime)}</p>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   STAKE PANEL
   ════════════════════════════════════════════════════════════ */

const StakePanel = ({ staking }) => {
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('stake')
  const [submitting, setSubmitting] = useState(false)

  const usdcBalRaw = staking.stats.usdcBalance || 0n
  const stakedBalRaw = staking.stats.userStaked || 0n
  const usdcBal = ethers.formatUnits(usdcBalRaw, staking.stats.decimals)
  const stakedBal = ethers.formatUnits(stakedBalRaw, staking.stats.decimals)
  const maxAmount = mode === 'stake' ? usdcBal : stakedBal

  const needsApproval = (() => {
    if (mode !== 'stake' || !amount || parseFloat(amount) <= 0) return false
    try {
      const parsed = parseTokenAmount(amount, staking.stats.decimals)
      return parsed > (staking.stats.allowance || 0n)
    } catch { return false }
  })()

  const handleMax = () => {
    const max = mode === 'stake' ? usdcBal : stakedBal
    if (parseFloat(max) > 0) setAmount(max)
  }

  const handleAction = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    setSubmitting(true)
    try {
      if (mode === 'stake') {
        if (needsApproval) {
          await staking.approveAndStake(amount, staking.stats.decimals)
        } else {
          await staking.stake(amount, staking.stats.decimals)
        }
      } else {
        await staking.withdraw(amount, staking.stats.decimals)
      }
      setAmount('')
    } catch {
      // toast already shown
    } finally {
      setSubmitting(false)
    }
  }

  const btnLabel = () => {
    if (submitting || staking.approving) return '...'
    if (mode === 'unstake') return 'Unstake'
    if (needsApproval) return 'Approve & Stake'
    return 'Stake'
  }

  return (
    <div className="gradient-border glow-cyan relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6 flex-1">
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => setMode('stake')}
          className={`text-lg font-bold tracking-tight transition-colors ${mode === 'stake' ? 'text-white' : 'text-gray-500'}`}
        >
          Stake Your Tokens
        </button>
        <span className="text-gray-600">/</span>
        <button
          onClick={() => setMode('unstake')}
          className={`text-sm font-semibold transition-colors ${mode === 'unstake' ? 'text-white' : 'text-gray-500'}`}
        >
          Unstake
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 bg-dark-bg/60 border border-dark-border rounded-xl px-4 py-3.5">
          <img src={USDC_LOGO} alt="USDC" className="w-5 h-5 rounded-full flex-shrink-0" />
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="flex-1 bg-transparent outline-none text-lg font-medium placeholder-gray-600 min-w-0"
          />
          <button onClick={handleMax} className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex-shrink-0 ml-2">
            MAX
          </button>
        </div>

        <button
          onClick={handleAction}
          disabled={!staking.account || submitting || staking.approving || !amount || parseFloat(amount) <= 0}
          className="px-8 py-3.5 rounded-xl bg-gradient-cyan-violet font-bold text-dark-bg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
        >
          {btnLabel()}
        </button>
      </div>

      {mode === 'stake' && needsApproval && (
        <p className="text-xs text-yellow-400 mt-2.5">
          First time — "Approve & Stake" will do both in 2 transactions. After this you can stake anytime without approving again.
        </p>
      )}

      <div className="flex items-center justify-between mt-4 text-xs text-gray-500 flex-wrap gap-2">
        <div className="flex gap-4">
          <span>Staked: <span className="text-white font-medium">{formatTokenAmount(staking.stats.userStaked, staking.stats.decimals)} USDC</span></span>
          {staking.account && (
            <span>Wallet: <span className="text-white font-medium">{formatTokenAmount(staking.stats.usdcBalance, staking.stats.decimals)} USDC</span></span>
          )}
        </div>
        {staking.account && staking.stats.userEarned > 0n && (
          <button onClick={staking.claimReward} className="text-cyan-400 hover:text-cyan-300 font-semibold">
            Claim {formatTokenAmount(staking.stats.userEarned, staking.stats.decimals)} USDC
          </button>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   REWARD SNAPSHOT CHART (real on-chain data, no fabricated history)
   ════════════════════════════════════════════════════════════ */

const RewardSnapshotChart = ({ stats }) => {
  const staked = parseFloat(ethers.formatUnits(stats.userStaked, stats.decimals))
  const earned = parseFloat(ethers.formatUnits(stats.userEarned, stats.decimals))
  const total = parseFloat(ethers.formatUnits(stats.totalStaked, stats.decimals))

  const hasData = staked > 0 || earned > 0 || total > 0

  if (!hasData) {
    return (
      <div className="gradient-border glow-cyan relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Reward Snapshot</h3>
        <p className="text-xs text-gray-500 mb-6">
          This contract does not yet have an on-chain history indexer — figures shown are live current-state values only.
        </p>
        <div className="flex flex-col items-center justify-center py-10 text-gray-500">
          <span className="text-sm">No staking activity yet</span>
          <span className="text-xs mt-1">Stake USDC to start seeing your position here</span>
        </div>
      </div>
    )
  }

  const bars = [
    { label: 'Your Stake', value: staked, color: '#00F0FF' },
    { label: 'Your Rewards', value: earned, color: '#8B5CF6' },
    { label: 'Protocol Total', value: total, color: '#67E8F9' },
  ]
  const maxVal = Math.max(...bars.map((b) => b.value), 1)

  return (
    <div className="gradient-border glow-cyan relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">Reward Snapshot</h3>
      <p className="text-xs text-gray-500 mb-6">Live current-state values read directly from the contract.</p>
      <div className="flex flex-col gap-4">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>{bar.label}</span>
              <span className="font-semibold text-white">
                {bar.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-dark-bg overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(2, (bar.value / maxVal) * 100)}%`, backgroundColor: bar.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN DASHBOARD VIEW
   ════════════════════════════════════════════════════════════ */

const DashboardView = ({ staking }) => {
  return (
    <>
      <StatsRow stats={staking.stats} />
      <div className="flex flex-col sm:flex-row gap-5 mb-6 sm:mb-8">
        <StakePanel staking={staking} />
        <ProgressRing stats={staking.stats} />
      </div>
      <RewardSnapshotChart stats={staking.stats} />
    </>
  )
}

/* ════════════════════════════════════════════════════════════
   REWARDS VIEW
   ════════════════════════════════════════════════════════════ */

const RewardsView = ({ staking }) => {
  const earned = formatTokenAmount(staking.stats.userEarned, staking.stats.decimals)

  return (
    <div className="flex flex-col gap-5">
      <div className="gradient-border glow-violet relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6 sm:p-8 text-center">
        <p className="text-sm text-gray-400 mb-2">Claimable Rewards</p>
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src={USDC_LOGO} alt="USDC" className="w-8 h-8 rounded-full" />
          <span className="text-4xl font-bold">{earned}</span>
          <span className="text-sm text-gray-500 font-semibold">USDC</span>
        </div>
        <button
          onClick={staking.claimReward}
          disabled={!staking.account || staking.stats.userEarned === 0n}
          className="px-8 py-3 rounded-xl bg-gradient-cyan-violet font-bold text-dark-bg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          Claim Rewards
        </button>
        {!staking.account && <p className="text-xs text-gray-500 mt-3">Connect your wallet to view and claim rewards</p>}
      </div>

      <div className="gradient-border relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Reward Details</h3>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Current APR</span>
            <span className="font-semibold">{formatAPR(staking.stats.apr)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Your staked balance</span>
            <span className="font-semibold">{formatTokenAmount(staking.stats.userStaked, staking.stats.decimals)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Reward period ends in</span>
            <span className="font-semibold">
              {Number(staking.stats.remainingTime) > 0 ? `${Math.floor(Number(staking.stats.remainingTime) / 86400)}d` : 'Ended'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   ANALYTICS VIEW
   ════════════════════════════════════════════════════════════ */

const AnalyticsView = ({ staking }) => {
  const totalStaked = parseFloat(ethers.formatUnits(staking.stats.totalStaked, staking.stats.decimals))
  const userStaked = parseFloat(ethers.formatUnits(staking.stats.userStaked, staking.stats.decimals))
  const sharePct = totalStaked > 0 ? ((userStaked / totalStaked) * 100).toFixed(2) : '0.00'

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="gradient-border glow-cyan relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6">
          <p className="text-sm text-gray-400 mb-2">Your Pool Share</p>
          <p className="text-3xl font-bold">{sharePct}%</p>
        </div>
        <div className="gradient-border glow-violet relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6">
          <p className="text-sm text-gray-400 mb-2">Protocol Status</p>
          <p className="text-3xl font-bold">{staking.stats.remainingTime > 0n ? 'Active' : 'Ended'}</p>
        </div>
      </div>
      <RewardSnapshotChart stats={staking.stats} />
      <div className="gradient-border relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Contract Info</h3>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Staking contract</span>
            <a
              href={`${SEPOLIA_EXPLORER}/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-cyan-400 hover:text-cyan-300"
            >
              {shortenAddress(CONTRACT_ADDRESS)} ↗
            </a>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Token</span>
            <a
              href={`${SEPOLIA_EXPLORER}/address/${USDC_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-cyan-400 hover:text-cyan-300"
            >
              {shortenAddress(USDC_ADDRESS)} ↗
            </a>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Network</span>
            <span className="font-semibold">Sepolia Testnet</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SETTINGS VIEW
   ════════════════════════════════════════════════════════════ */

const SettingsView = ({ staking, theme, toggleTheme }) => (
  <div className="flex flex-col gap-5">
    <div className="gradient-border relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Appearance</h3>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">Theme</span>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-dark-bg border border-dark-border text-sm font-medium"
        >
          {theme === 'dark' ? Icon.moon('w-4 h-4') : Icon.sun('w-4 h-4')}
          {theme === 'dark' ? 'Dark' : 'Light'}
        </button>
      </div>
    </div>

    <div className="gradient-border relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Wallet</h3>
      {staking.account ? (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Connected address</span>
            <span className="font-mono">{shortenAddress(staking.account)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Network</span>
            <span className={staking.isCorrectNetwork ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
              {staking.isCorrectNetwork ? 'Sepolia ✓' : 'Wrong network'}
            </span>
          </div>
          <button
            onClick={staking.disconnectWallet}
            className="mt-2 px-4 py-2 rounded-lg bg-red-400/10 text-red-400 text-sm font-semibold hover:bg-red-400/20 transition-colors w-fit"
          >
            Disconnect Wallet
          </button>
        </div>
      ) : (
        <button
          onClick={staking.connectWallet}
          className="px-5 py-2.5 rounded-xl bg-gradient-cyan-violet font-bold text-dark-bg hover:opacity-90 transition-opacity"
        >
          Connect Wallet
        </button>
      )}
    </div>

    <div className="gradient-border relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Danger Zone</h3>
      <p className="text-xs text-gray-500 mb-3">
        Emergency withdraw lets you pull your staked USDC immediately, even if the protocol is paused. Any pending rewards will be forfeited.
      </p>
      <button
        onClick={staking.emergencyWithdraw}
        disabled={!staking.account || staking.stats.userStaked === 0n}
        className="px-4 py-2 rounded-lg bg-red-400/10 text-red-400 text-sm font-semibold hover:bg-red-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Emergency Withdraw
      </button>
    </div>
  </div>
)

/* ════════════════════════════════════════════════════════════
   APP ROOT
   ════════════════════════════════════════════════════════════ */

const AppInner = () => {
  const staking = useStaking()
  const { theme, toggleTheme } = useTheme()
  const [active, setActive] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  const titles = { dashboard: 'Dashboard', stake: 'Stake', rewards: 'Rewards', analytics: 'Analytics', settings: 'Settings' }

  const renderView = () => {
    switch (active) {
      case 'dashboard':
      case 'stake':
        return <DashboardView staking={staking} />
      case 'rewards':
        return <RewardsView staking={staking} />
      case 'analytics':
        return <AnalyticsView staking={staking} />
      case 'settings':
        return <SettingsView staking={staking} theme={theme} toggleTheme={toggleTheme} />
      default:
        return <DashboardView staking={staking} />
    }
  }

  return (
    <div className="flex min-h-screen bg-dark-bg">
      <Sidebar active={active} setActive={setActive} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 min-w-0 overflow-hidden">
        <TopBar title={titles[active]} staking={staking} theme={theme} toggleTheme={toggleTheme} setMobileOpen={setMobileOpen} />
        {renderView()}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <TxProvider>
        <AppInner />
      </TxProvider>
    </ToastProvider>
  )
}

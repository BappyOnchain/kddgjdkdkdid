import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { ethers } from 'ethers'

/* ════════════════════════════════════════════════════════════
   CONFIG
   ════════════════════════════════════════════════════════════ */

const REOWN_PROJECT_ID = '1724feb47aaa94102743462f8a84e693'
const CONTRACT_ADDRESS = '0xa036ad353aBce14eb27F8140aD20B5b6cED241F9'
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const USDC_LOGO = 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png'
const SEPOLIA_CHAIN_ID = 11155111
const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7'
const SEPOLIA_RPC = 'https://rpc.sepolia.org'
const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io'

const SEPOLIA_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: 'Sepolia Testnet',
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: [SEPOLIA_RPC],
  blockExplorerUrls: [SEPOLIA_EXPLORER],
}

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
    decimals: 6,
    symbol: 'USDC',
  })
  const [loadingStats, setLoadingStats] = useState(false)

  const getEthereum = () => (typeof window !== 'undefined' ? window.ethereum : null)

  const isCorrectNetwork = chainId === SEPOLIA_CHAIN_ID

  /* ── Build read-only contract for stats even without wallet connected ── */
  const fetchStatsPublic = useCallback(async (addr) => {
    try {
      const roProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
      const roContract = new ethers.Contract(CONTRACT_ADDRESS, STAKING_ABI, roProvider)

      const [totalStaked, apr, remainingTime] = await Promise.all([
        roContract.totalStaked(),
        roContract.currentAPR(),
        roContract.remainingTime(),
      ])

      let userStaked = 0n
      let userEarned = 0n
      if (addr) {
        ;[userStaked, userEarned] = await Promise.all([
          roContract.stakedBalance(addr),
          roContract.earned(addr),
        ])
      }

      setStats((prev) => ({
        ...prev,
        totalStaked,
        apr,
        remainingTime,
        userStaked,
        userEarned,
      }))
    } catch (err) {
      console.error('Stats fetch error:', err)
    }
  }, [])

  /* ── Connect wallet ── */
  const connectWallet = useCallback(async () => {
    const eth = getEthereum()
    if (!eth) {
      addToast('No wallet found. Please install MetaMask or Rabby.', 'error')
      return
    }
    setConnecting(true)
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' })
      const browserProvider = new ethers.BrowserProvider(eth)
      const network = await browserProvider.getNetwork()
      const currentChainId = Number(network.chainId)

      if (currentChainId !== SEPOLIA_CHAIN_ID) {
        try {
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }] })
        } catch (switchErr) {
          if (switchErr.code === 4902) {
            await eth.request({ method: 'wallet_addEthereumChain', params: [SEPOLIA_PARAMS] })
          } else {
            throw switchErr
          }
        }
      }

      const finalProvider = new ethers.BrowserProvider(eth)
      const finalSigner = await finalProvider.getSigner()
      const finalNetwork = await finalProvider.getNetwork()
      const stakingContract = new ethers.Contract(CONTRACT_ADDRESS, STAKING_ABI, finalSigner)

      setProvider(finalProvider)
      setSigner(finalSigner)
      setContract(stakingContract)
      setAccount(accounts[0])
      setChainId(Number(finalNetwork.chainId))
      addToast('Wallet connected successfully', 'success')
    } catch (err) {
      console.error(err)
      if (err.code === 4001) {
        addToast('Connection rejected by user', 'error')
      } else {
        addToast(err.shortMessage || err.message || 'Failed to connect wallet', 'error')
      }
    } finally {
      setConnecting(false)
    }
  }, [addToast])

  const disconnectWallet = useCallback(() => {
    setAccount(null)
    setSigner(null)
    setContract(null)
    setChainId(null)
    addToast('Wallet disconnected', 'info')
  }, [addToast])

  /* ── Listen for account / chain changes ── */
  useEffect(() => {
    const eth = getEthereum()
    if (!eth) return

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet()
      } else {
        setAccount(accounts[0])
      }
    }
    const handleChainChanged = (newChainIdHex) => {
      setChainId(parseInt(newChainIdHex, 16))
    }

    eth.on?.('accountsChanged', handleAccountsChanged)
    eth.on?.('chainChanged', handleChainChanged)

    return () => {
      eth.removeListener?.('accountsChanged', handleAccountsChanged)
      eth.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [disconnectWallet])

  /* ── Poll stats every 15s ── */
  useEffect(() => {
    fetchStatsPublic(account)
    const interval = setInterval(() => fetchStatsPublic(account), 15000)
    return () => clearInterval(interval)
  }, [account, fetchStatsPublic])

  /* ── Transaction wrapper with toast feedback ── */
  const sendTx = useCallback(
    async (fn, successMsg) => {
      try {
        const tx = await fn()
        addToast('Transaction submitted...', 'pending', tx.hash, 8000)
        const receipt = await tx.wait()
        addToast(successMsg, 'success', receipt.hash)
        await fetchStatsPublic(account)
        return receipt
      } catch (err) {
        console.error(err)
        if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
          addToast('Transaction rejected', 'error')
        } else {
          addToast(err.shortMessage || err.reason || 'Transaction failed', 'error')
        }
        throw err
      }
    },
    [account, addToast, fetchStatsPublic]
  )

  const stake = useCallback(
    (amount, decimals = 18) => {
      if (!contract) return addToast('Connect wallet first', 'error')
      const parsedAmount = parseTokenAmount(amount, decimals)
      return sendTx(() => contract.stake(parsedAmount), 'Staked successfully!')
    },
    [contract, sendTx, addToast]
  )

  const withdraw = useCallback(
    (amount, decimals = 18) => {
      if (!contract) return addToast('Connect wallet first', 'error')
      const parsedAmount = parseTokenAmount(amount, decimals)
      return sendTx(() => contract.withdraw(parsedAmount), 'Withdrawn successfully!')
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
        className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full bg-dark-card border border-dark-border hover:border-cyan-400/50 transition-colors text-sm font-medium disabled:opacity-60"
      >
        {connecting ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <span className="w-2 h-2 rounded-full bg-gray-500" />
        )}
        <span className="hidden sm:inline">{connecting ? 'Connecting...' : 'Wallet connect'}</span>
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setDropdownOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-full bg-dark-card border ${
          isCorrectNetwork ? 'border-dark-border' : 'border-red-500/50'
        } hover:border-cyan-400/50 transition-colors text-sm font-medium`}
      >
        <span className={`w-2 h-2 rounded-full ${isCorrectNetwork ? 'bg-green-400' : 'bg-red-400'} flex-shrink-0`} />
        <span className="hidden sm:inline">{shortenAddress(account)}</span>
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
  <div className="flex items-center justify-between mb-6 sm:mb-8">
    <div className="flex items-center gap-3">
      <button className="lg:hidden text-gray-300" onClick={() => setMobileOpen(true)}>
        {Icon.menu()}
      </button>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
    </div>
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        onClick={toggleTheme}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-dark-card border border-dark-border hover:border-cyan-400/50 transition-colors text-gray-300"
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
      <button className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full bg-dark-card border border-dark-border text-gray-300 hover:border-cyan-400/50 transition-colors">
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
  const [mode, setMode] = useState('stake') // stake | withdraw
  const [submitting, setSubmitting] = useState(false)

  const maxAmount = mode === 'stake' ? null : ethers.formatUnits(staking.stats.userStaked, staking.stats.decimals)

  const handleMax = () => {
    if (mode === 'withdraw') setAmount(maxAmount)
  }

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    setSubmitting(true)
    try {
      if (mode === 'stake') {
        await staking.stake(amount, staking.stats.decimals)
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
          onClick={() => setMode('withdraw')}
          className={`text-sm font-semibold transition-colors ${mode === 'withdraw' ? 'text-white' : 'text-gray-500'}`}
        >
          Withdraw
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
          {mode === 'withdraw' && (
            <button onClick={handleMax} className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex-shrink-0 ml-2">
              MAX
            </button>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!staking.account || submitting || !amount}
          className="px-8 py-3.5 rounded-xl bg-gradient-cyan-violet font-bold text-dark-bg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
        >
          {submitting ? '...' : mode === 'stake' ? 'Stake' : 'Withdraw'}
        </button>
      </div>

      <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
        <span>
          Staked balance: {formatTokenAmount(staking.stats.userStaked, staking.stats.decimals)} {staking.stats.symbol}
        </span>
        {staking.account && staking.stats.userEarned > 0n && (
          <button onClick={staking.claimReward} className="text-cyan-400 hover:text-cyan-300 font-semibold">
            Claim {formatTokenAmount(staking.stats.userEarned, staking.stats.decimals)} {staking.stats.symbol}
          </button>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   AREA CHART (pure SVG, no external lib)
   ════════════════════════════════════════════════════════════ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Aug']

const AreaChart = ({ data }) => {
  const width = 1000
  const height = 280
  const padding = { top: 20, right: 20, bottom: 30, left: 40 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom
  const maxVal = 150

  const points = data.map((val, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW
    const y = padding.top + chartH - (val / maxVal) * chartH
    return { x, y }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`

  const yLabels = [0, 50, 100, 150]

  return (
    <div className="gradient-border glow-cyan relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-5 sm:p-6 overflow-x-auto scrollbar-hide">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Reward Accrual Over Time</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[600px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="lineStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00F0FF" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>

        {yLabels.map((label) => {
          const y = padding.top + chartH - (label / maxVal) * chartH
          return (
            <g key={label}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#1E2433" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#6B7280">
                {label}
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill="url(#areaFill)" />
        <path d={linePath} fill="none" stroke="url(#lineStroke)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#0B0E14" stroke="#00F0FF" strokeWidth="2" />
        ))}

        {MONTHS.map((m, i) => (
          <text key={m} x={points[i].x} y={height - 6} textAnchor="middle" fontSize="11" fill="#6B7280">
            {m}
          </text>
        ))}
      </svg>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN DASHBOARD VIEW
   ════════════════════════════════════════════════════════════ */

const DashboardView = ({ staking }) => {
  const chartData = [10, 45, 38, 70, 75, 105, 105, 150]
  return (
    <>
      <StatsRow stats={staking.stats} />
      <div className="flex flex-col sm:flex-row gap-5 mb-6 sm:mb-8">
        <StakePanel staking={staking} />
        <ProgressRing stats={staking.stats} />
      </div>
      <AreaChart data={chartData} />
    </>
  )
}

const PlaceholderView = ({ title }) => (
  <div className="gradient-border relative rounded-2xl bg-dark-card/60 backdrop-blur-md p-10 text-center text-gray-400">
    <p className="text-lg font-semibold mb-1">{title}</p>
    <p className="text-sm">This section is under construction.</p>
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

  return (
    <div className="flex min-h-screen bg-dark-bg">
      <Sidebar active={active} setActive={setActive} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 min-w-0">
        <TopBar title={titles[active]} staking={staking} theme={theme} toggleTheme={toggleTheme} setMobileOpen={setMobileOpen} />
        {active === 'dashboard' || active === 'stake' ? <DashboardView staking={staking} /> : <PlaceholderView title={titles[active]} />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

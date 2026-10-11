import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Download,
  LayoutGrid,
  MoonStar,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  Trash2,
  Users,
  Waypoints,
  SunMedium,
  RefreshCw,
  CheckCircle2,
  LogOut,
  LockKeyhole,
  Eye,
  EyeOff,
} from 'lucide-react'
import { supabase, supabaseConfigError } from './supabase'
import './App.css'

type Section = 'overview' | 'players' | 'ranking' | 'check' | 'history' | 'stats' | 'settings'
type TournamentStatus = 'draft' | 'active' | 'paused' | 'completed'
type AuthRole = 'manager' | 'contestant'

type AuthSession = {
  userId: string
  username: string
  role: AuthRole
  displayName: string
  playerNumber: number | null
}

type ScoreEntry = {
  rank: number
  points: number
}

type Player = {
  id: string
  displayName: string
  avatar: string
}

type RoundResult = {
  id: string
  round: number
  recordedAt: string
  status: 'complete' | 'draft'
  results: Array<{
    playerId: string
    rank: number
    points: number
  }>
}

type Tournament = {
  id: string
  name: string
  status: TournamentStatus
  players: Player[]
  currentRound: number
  totalRounds: number
  scoreTable: ScoreEntry[]
  championRule: string
  championThreshold?: number
  createdAt: string
  completedAt?: string
  lastUpdated: string
  rounds: RoundResult[]
}

type AppState = {
  darkMode: boolean
  defaultName: string
  defaultRoundCount: number
  defaultScoreTable: ScoreEntry[]
  championRule: string
  championThreshold: number
  tournaments: Tournament[]
  activeTournamentId: string | null
}

type EditableRoundDraft = {
  round: number
  results: Array<{
    playerId: string
    rank: number
  }>
}

const STORAGE_KEY = 'tft-tournament-pro-v1'
const SHARED_STATE_ID = 'main'
const subscribeToLocation = (callback: () => void) => {
  window.addEventListener('popstate', callback)
  window.addEventListener('tft-locationchange', callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener('tft-locationchange', callback)
  }
}
const getLocationSearch = () => window.location.search
const getServerLocationSearch = () => ''
const DEFAULT_SCORE_TABLE: ScoreEntry[] = [
  { rank: 1, points: 8 },
  { rank: 2, points: 7 },
  { rank: 3, points: 6 },
  { rank: 4, points: 5 },
  { rank: 5, points: 4 },
  { rank: 6, points: 3 },
  { rank: 7, points: 2 },
  { rank: 8, points: 1 },
]
const normalizeScoreTable = (table: ScoreEntry[]): ScoreEntry[] => {
  const entries = [...table]
    .filter((item) => Number.isFinite(item.rank) && Number.isFinite(item.points))
    .map((item) => ({ rank: Number(item.rank), points: Number(item.points) }))
    .sort((a, b) => a.rank - b.rank)

  const merged = new Map<number, number>()
  entries.forEach((entry) => {
    merged.set(entry.rank, entry.points)
  })

  const output: ScoreEntry[] = []
  for (let rank = 1; rank <= 8; rank += 1) {
    if (merged.has(rank)) {
      output.push({ rank, points: merged.get(rank) as number })
    }
  }

  return output.length ? output : DEFAULT_SCORE_TABLE
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const scoreForRank = (rank: number, table: ScoreEntry[]): number => {
  const found = table.find((entry) => entry.rank === rank)
  return found ? found.points : 0
}

const buildPlayerName = (index: number) => `Người chơi ${index + 1}`
const currentTimestamp = () => new Date().toISOString()

const getPlayerAvatar = (player: Player, index: number) =>
  player.avatar || `/player-avatars/player-${(index % 8) + 1}.png`

const buildDefaultPlayers = (count: number, names: string[] = []): Player[] =>
  Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    displayName: names[index]?.trim() || buildPlayerName(index),
    avatar: `/player-avatars/player-${(index % 8) + 1}.png`,
  }))

const createTournament = (
  name: string,
  playerCount: number,
  roundCount: number,
  scoreTable: ScoreEntry[],
  championRule: string,
  playerNames: string[],
  championThreshold: number,
): Tournament => ({
  id: crypto.randomUUID(),
  name: name.trim() || 'Ao Làng LA',
  status: 'draft',
  players: buildDefaultPlayers(playerCount, playerNames),
  currentRound: 1,
  totalRounds: roundCount,
  scoreTable: normalizeScoreTable(scoreTable),
  championRule,
  championThreshold,
  createdAt: currentTimestamp(),
  lastUpdated: currentTimestamp(),
  rounds: [],
})

const getTournamentRanking = (tournament: Tournament) => {
  const players = tournament.players.map((player) => {
    const playerRounds = tournament.rounds
      .slice()
      .sort((a, b) => a.round - b.round)
      .map((round) => ({
        round,
        result: round.results.find((entry) => entry.playerId === player.id),
      }))
    const roundsWithPlayer = playerRounds.filter((entry) => entry.result)
    const playedRounds = roundsWithPlayer.length
    const totalPoints = roundsWithPlayer.reduce((sum, entry) => sum + (entry.result?.points ?? 0), 0)
    const top1s = tournament.rounds.filter(
      (round) => round.results.some((entry) => entry.playerId === player.id && entry.rank === 1),
    ).length
    const top4s = tournament.rounds.filter(
      (round) => round.results.some((entry) => entry.playerId === player.id && entry.rank <= 4),
    ).length
    const totalRanks = roundsWithPlayer.reduce((sum, entry) => sum + (entry.result?.rank ?? 99), 0)
    const averageRank = playedRounds ? totalRanks / playedRounds : 0
    const bestFinish = playedRounds
      ? Math.min(...roundsWithPlayer.map((entry) => entry.result?.rank ?? 99))
      : 99
    const recentPoints = roundsWithPlayer.length
      ? (roundsWithPlayer[roundsWithPlayer.length - 1].result?.points ?? 0)
      : 0
    const championThreshold = tournament.championThreshold ?? 20
    const checkmate = totalPoints >= championThreshold
    let pointsBeforeRound = 0
    const checkmateRound = playerRounds.find(({ result }) => {
      pointsBeforeRound += result?.points ?? 0
      return pointsBeforeRound >= championThreshold
    })?.round.round
    const champion = checkmateRound !== undefined && Boolean(
      tournament.rounds
        .find((round) => round.round === checkmateRound + 1)
        ?.results.some((entry) => entry.playerId === player.id && entry.rank === 1),
    )

    return {
      ...player,
      totalPoints,
      roundsPlayed: playedRounds,
      top1s,
      top4s,
      averageRank,
      bestFinish,
      recentPoints,
      checkmate,
      champion,
    }
  })

  return players.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (b.top1s !== a.top1s) return b.top1s - a.top1s
    return a.averageRank - b.averageRank
  })
}

const getHistoryRoundData = (tournament: Tournament, roundNumber: number) => {
  const round = tournament.rounds.find((item) => item.round === roundNumber)
  return round ?? null
}

const getOverviewStats = (tournament: Tournament) => {
  const ranking = getTournamentRanking(tournament)
  const currentLeader = ranking[0]
  const completedRounds = tournament.rounds.filter((round) => round.status === 'complete').length
  const currentRound = tournament.status === 'completed' ? tournament.totalRounds : tournament.currentRound

  return {
    completedRounds,
    currentRound,
    currentLeader,
    totalPlayers: tournament.players.length,
  }
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

const defaultAppState = (): AppState => ({
  darkMode: true,
  defaultName: 'Ao Làng LA',
  defaultRoundCount: 8,
  defaultScoreTable: DEFAULT_SCORE_TABLE,
  championRule: 'checkmate + top 1 ở ván tiếp theo',
  championThreshold: 20,
  tournaments: [],
  activeTournamentId: null,
})

const normalizeAppState = (raw: unknown): AppState => {
  if (!raw || typeof raw !== 'object') return defaultAppState()
  const parsed = raw as Partial<AppState>
  return {
    ...defaultAppState(),
    ...parsed,
    defaultScoreTable: normalizeScoreTable(
      Array.isArray(parsed.defaultScoreTable) ? parsed.defaultScoreTable : DEFAULT_SCORE_TABLE,
    ),
    championThreshold: Number.isFinite(parsed.championThreshold) ? Number(parsed.championThreshold) : 20,
    tournaments: Array.isArray(parsed.tournaments) ? parsed.tournaments : [],
    activeTournamentId: parsed.activeTournamentId ?? null,
  }
}

function App() {
  const [appState, setAppState] = useState<AppState>(defaultAppState)
  const [activeSection, setActiveSection] = useState<Section>('overview')
  const [authenticatedAccount, setAuthenticatedAccount] = useState<AuthSession | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(supabase))
  const [isCloudReady, setIsCloudReady] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'syncing' | 'synced' | 'error'>('connecting')
  const [syncError, setSyncError] = useState('')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const lastCloudState = useRef<string | null>(null)
  const locationSearch = useSyncExternalStore(
    subscribeToLocation,
    getLocationSearch,
    getServerLocationSearch,
  )
  const isContestantView =
    authenticatedAccount?.role === 'contestant' ||
    (authenticatedAccount?.role === 'manager' &&
      new URLSearchParams(locationSearch).get('view') === 'contestant')
  const [newTournamentForm, setNewTournamentForm] = useState({
    name: 'Ao Làng LA',
    playerCount: 8,
    totalRounds: 8,
    playerNames: Array.from({ length: 8 }, (_, index) => buildPlayerName(index)),
  })
  const [isCreateTournamentOpen, setIsCreateTournamentOpen] = useState(false)
  const [comparisonTournamentIds, setComparisonTournamentIds] = useState<[string, string]>(['', ''])
  const [editingTournamentName, setEditingTournamentName] = useState('')
  const [playerDraft, setPlayerDraft] = useState({ name: '', avatar: '' })
  const [exportNotice, setExportNotice] = useState('')
  const [roundEditor, setRoundEditor] = useState<EditableRoundDraft | null>(null)
  const [playerSearch, setPlayerSearch] = useState('')

  const activeTournament = useMemo(
    () => appState.tournaments.find((item) => item.id === appState.activeTournamentId) ?? null,
    [appState.activeTournamentId, appState.tournaments],
  )

  const activateAccount = useCallback(async (userId: string) => {
    if (!supabase) throw new Error(supabaseConfigError)

    const { data: profile, error: profileError } = await supabase
      .from('tournament_user_roles')
      .select('username, role_name, display_name, player_number')
      .eq('user_id', userId)
      .maybeSingle()
    if (profileError) throw new Error(`Không đọc được phân quyền: ${profileError.message}`)
    if (!profile || (profile.role_name !== 'manager' && profile.role_name !== 'contestant')) {
      throw new Error('Tài khoản chưa được ban tổ chức gán vai trò trong Supabase.')
    }

    const account: AuthSession = {
      userId,
      username: profile.username,
      role: profile.role_name,
      displayName: profile.display_name,
      playerNumber: profile.player_number,
    }
    const { data: sharedState, error: stateError } = await supabase
      .from('tournament_app_state')
      .select('state')
      .eq('id', SHARED_STATE_ID)
      .maybeSingle()
    if (stateError) throw new Error(`Không tải được dữ liệu giải đấu: ${stateError.message}`)

    const state = sharedState ? normalizeAppState(sharedState.state) : defaultAppState()
    if (!sharedState && account.role === 'manager') {
      const { error: insertError } = await supabase
        .from('tournament_app_state')
        .insert({ id: SHARED_STATE_ID, state, updated_by: userId })
      if (insertError) throw new Error(`Không khởi tạo được dữ liệu chung: ${insertError.message}`)
    }

    lastCloudState.current = JSON.stringify(state)
    setAppState(state)
    setAuthenticatedAccount(account)
    setActiveSection('overview')
    setIsCloudReady(true)
    setSyncStatus('connecting')
    setSyncError('')
  }, [])

  useEffect(() => {
    if (!supabase) return
    const client = supabase

    let mounted = true
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setAuthenticatedAccount(null)
        setIsCloudReady(false)
        setAppState(defaultAppState())
        setSyncStatus('connecting')
      }
    })

    const restoreSession = async () => {
      try {
        const { data, error } = await client.auth.getSession()
        if (error) throw new Error(`Không khôi phục được phiên đăng nhập: ${error.message}`)
        if (data.session) {
          try {
            await activateAccount(data.session.user.id)
          } catch (activationError) {
            const { error: signOutError } = await client.auth.signOut()
            const message = activationError instanceof Error ? activationError.message : 'Không thể tải tài khoản.'
            if (signOutError) {
              throw new Error(`${message} Đăng xuất phiên lỗi thất bại: ${signOutError.message}`)
            }
            throw activationError
          }
        }
      } catch (restoreError) {
        if (mounted) {
          setLoginError(restoreError instanceof Error ? restoreError.message : 'Không thể khôi phục phiên đăng nhập.')
        }
      } finally {
        if (mounted) setIsAuthLoading(false)
      }
    }

    void restoreSession()
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [activateAccount])

  useEffect(() => {
    if (!authenticatedAccount || !isCloudReady || !supabase) return
    const client = supabase

    const serializedState = JSON.stringify(appState)
    localStorage.setItem(STORAGE_KEY, serializedState)
    if (authenticatedAccount.role !== 'manager' || serializedState === lastCloudState.current) return

    setSyncStatus('syncing')
    setSyncError('')
    const timeout = window.setTimeout(async () => {
      const { error } = await client
        .from('tournament_app_state')
        .upsert(
          { id: SHARED_STATE_ID, state: appState, updated_by: authenticatedAccount.userId },
          { onConflict: 'id' },
        )
      if (error) {
        setSyncStatus('error')
        setSyncError(`Không đồng bộ được dữ liệu: ${error.message}`)
        return
      }
      lastCloudState.current = serializedState
      setSyncStatus('synced')
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [appState, authenticatedAccount, isCloudReady])

  useEffect(() => {
    if (!authenticatedAccount || !isCloudReady || !supabase) return
    const client = supabase

    const channel = client
      .channel('tournament-app-state-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_app_state', filter: `id=eq.${SHARED_STATE_ID}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const state = defaultAppState()
            lastCloudState.current = JSON.stringify(state)
            setAppState(state)
            return
          }
          const state = normalizeAppState(payload.new.state)
          lastCloudState.current = JSON.stringify(state)
          setAppState((current) => (
            JSON.stringify(current) === lastCloudState.current ? current : state
          ))
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSyncStatus((current) => current === 'error' ? current : 'synced')
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSyncStatus('error')
          setSyncError('Kết nối cập nhật trực tiếp bị gián đoạn. Hãy tải lại trang nếu dữ liệu chưa mới.')
        }
      })

    return () => {
      void client.removeChannel(channel)
    }
  }, [authenticatedAccount, isCloudReady])

  const changeView = (contestant: boolean) => {
    if (!authenticatedAccount || (contestant && authenticatedAccount.role !== 'manager')) return
    const url = new URL(window.location.href)
    if (contestant && authenticatedAccount.role === 'manager') url.searchParams.set('view', 'contestant')
    else url.searchParams.delete('view')
    window.history.pushState({}, '', url)
    window.dispatchEvent(new Event('tft-locationchange'))
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setLoginError(supabaseConfigError)
      return
    }

    setIsLoggingIn(true)
    setLoginError('')
    const username = loginUsername.trim().toLowerCase()
    const email = username.includes('@') ? username : `${username}@accounts.tft.example`
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: loginPassword,
      })
      if (error) {
        setLoginError('Tên đăng nhập hoặc mật khẩu không đúng.')
        return
      }

      await activateAccount(data.user.id)
      setLoginPassword('')
      const url = new URL(window.location.href)
      url.searchParams.delete('view')
      window.history.replaceState({}, '', url)
    } catch (activationError) {
      const { error: signOutError } = await supabase.auth.signOut()
      const errorMessage = activationError instanceof Error ? activationError.message : 'Không thể tải tài khoản.'
      setLoginError(signOutError ? `${errorMessage} Đăng xuất phiên lỗi thất bại: ${signOutError.message}` : errorMessage)
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      setSyncStatus('error')
      setSyncError(`Không đăng xuất được: ${error.message}`)
      return
    }
    setLoginUsername('')
    setLoginPassword('')
    setLoginError('')
    const url = new URL(window.location.href)
    url.searchParams.delete('view')
    window.history.replaceState({}, '', url)
  }

  useEffect(() => {
    if (!activeTournament) {
      setEditingTournamentName('')
      return
    }
    setEditingTournamentName(activeTournament.name)
  }, [activeTournament])

  useEffect(() => {
    if (appState.tournaments.length && !appState.activeTournamentId) {
      setAppState((previous) => ({
        ...previous,
        activeTournamentId: previous.tournaments[0].id,
      }))
    }
  }, [appState.tournaments, appState.activeTournamentId])

  useEffect(() => {
    if (exportNotice) {
      const timer = window.setTimeout(() => setExportNotice(''), 2200)
      return () => window.clearTimeout(timer)
    }
  }, [exportNotice])

  const saveTournamentList = (nextTournaments: Tournament[]) => {
    setAppState((previous) => ({
      ...previous,
      tournaments: nextTournaments,
      activeTournamentId:
        previous.activeTournamentId && nextTournaments.some((item) => item.id === previous.activeTournamentId)
          ? previous.activeTournamentId
          : nextTournaments[0]?.id ?? null,
    }))
  }

  const updateActiveTournament = (updater: (tournament: Tournament) => Tournament) => {
    if (!activeTournament) return
    const nextTournaments = appState.tournaments.map((tournament) =>
      tournament.id === activeTournament.id ? updater(tournament) : tournament,
    )
    saveTournamentList(nextTournaments)
  }

  const openCreateTournament = () => {
    setNewTournamentForm({
      name: appState.defaultName,
      playerCount: 8,
      totalRounds: appState.defaultRoundCount,
      playerNames: Array.from({ length: 8 }, (_, index) => buildPlayerName(index)),
    })
    setIsCreateTournamentOpen(true)
  }

  const addTournament = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const created = createTournament(
      newTournamentForm.name,
      newTournamentForm.playerCount,
      newTournamentForm.totalRounds,
      appState.defaultScoreTable,
      appState.championRule,
      newTournamentForm.playerNames,
      appState.championThreshold,
    )
    created.status = 'active'
    const nextTournaments = [...appState.tournaments, created]
    setAppState((previous) => ({ ...previous, tournaments: nextTournaments, activeTournamentId: created.id }))
    setActiveSection('overview')
    setIsCreateTournamentOpen(false)
    setRoundEditor(null)
  }

  const addPlayer = () => {
    if (!activeTournament || !playerDraft.name.trim()) return
    const nextPlayers = [...activeTournament.players, {
      id: crypto.randomUUID(),
      displayName: playerDraft.name.trim(),
      avatar: playerDraft.avatar.trim() || `/player-avatars/player-${(activeTournament.players.length % 8) + 1}.png`,
    }]

    updateActiveTournament((tournament) => ({
      ...tournament,
      players: nextPlayers,
      lastUpdated: new Date().toISOString(),
    }))
    setPlayerDraft({ name: '', avatar: '' })
  }

  const deletePlayer = (playerId: string) => {
    if (!activeTournament) return
    const nextPlayers = activeTournament.players.filter((player) => player.id !== playerId)
    if (!nextPlayers.length) return

    updateActiveTournament((tournament) => ({
      ...tournament,
      players: nextPlayers,
      rounds: tournament.rounds.map((round) => ({
        ...round,
        results: round.results.filter((entry) => entry.playerId !== playerId),
      })),
      lastUpdated: new Date().toISOString(),
    }))
  }

  const setStatus = (status: TournamentStatus) => {
    if (!activeTournament) return
    const updatedAt = currentTimestamp()
    updateActiveTournament((tournament) => ({
      ...tournament,
      status,
      completedAt: status === 'completed' ? (tournament.completedAt ?? updatedAt) : tournament.completedAt,
      lastUpdated: updatedAt,
    }))
  }

  const setRoundResults = (draft: EditableRoundDraft) => {
    if (!activeTournament) return
    const uniqueChecks = new Set<number>()
    const hasDuplicates = draft.results.some((entry) => {
      if (uniqueChecks.has(entry.rank)) return true
      uniqueChecks.add(entry.rank)
      return false
    })

    if (hasDuplicates) {
      window.alert('Không được có hai người cùng một thứ hạng trong vòng này.')
      return
    }

    const payload = draft.results.map((entry) => {
      const player = activeTournament.players.find((item) => item.id === entry.playerId)
      return {
        playerId: entry.playerId,
        rank: entry.rank,
        points: player ? scoreForRank(entry.rank, activeTournament.scoreTable) : 0,
      }
    })

    const existing = activeTournament.rounds.find((round) => round.round === draft.round)
    const nextRound: RoundResult = {
      id: existing?.id ?? crypto.randomUUID(),
      round: draft.round,
      recordedAt: existing?.recordedAt ?? currentTimestamp(),
      status: 'complete',
      results: payload,
    }

    const nextRounds = existing
      ? activeTournament.rounds.map((round) => (round.round === draft.round ? nextRound : round))
      : [...activeTournament.rounds, nextRound].sort((a, b) => a.round - b.round)

    const updatedAt = currentTimestamp()
    updateActiveTournament((tournament) => ({
      ...tournament,
      rounds: nextRounds,
      status: tournament.status,
      completedAt: tournament.completedAt,
      currentRound: Math.min(tournament.totalRounds, Math.max(tournament.currentRound, draft.round + 1)),
      lastUpdated: updatedAt,
    }))
    setRoundEditor(null)
  }

  const ranking = activeTournament ? getTournamentRanking(activeTournament) : []

  const statsForCharts = useMemo(() => {
    if (!activeTournament) return []
    return Array.from({ length: activeTournament.totalRounds }, (_, index) => {
      const roundNumber = index + 1
      const round = getHistoryRoundData(activeTournament, roundNumber)
      const roundEntries = round?.results.map((entry) => ({
        round: roundNumber,
        playerId: entry.playerId,
        points: entry.points,
      })) ?? []

      return {
        round: roundNumber,
        ...Object.fromEntries(
          activeTournament.players.map((player) => {
            const found = roundEntries.find((entry) => entry.playerId === player.id)
            return [player.displayName, found?.points ?? 0]
          }),
        ),
      }
    })
  }, [activeTournament])

  const summaryCards = activeTournament
    ? [
        {
          label: 'Giải đấu đang hoạt động',
          value: activeTournament.name,
          accent: 'purple',
        },
        {
          label: 'Tổng số người chơi',
          value: String(activeTournament.players.length),
          accent: 'cyan',
        },
        {
          label: 'Số vòng đã hoàn thành',
          value: String(activeTournament.rounds.length),
          accent: 'green',
        },
        {
          label: 'Vòng hiện tại',
          value: String(activeTournament.currentRound),
          accent: 'amber',
        },
      ]
    : []

  const handleExport = () => {
    if (!activeTournament) return
    const blob = new Blob([JSON.stringify(activeTournament, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeTournament.name.toLowerCase().replace(/\s+/g, '-')}.json`
    link.click()
    URL.revokeObjectURL(url)
    setExportNotice('Đã xuất dữ liệu bằng JSON')
  }

  const handleBackup = () => {
    const payload = JSON.stringify(appState, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tft-tournament-pro-backup.json'
    link.click()
    URL.revokeObjectURL(url)
    setExportNotice('Đã sao lưu dữ liệu')
  }

  const handleRestore = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as Partial<AppState>
          setAppState({
            ...defaultAppState(),
            ...parsed,
            defaultScoreTable: normalizeScoreTable(parsed.defaultScoreTable ?? DEFAULT_SCORE_TABLE),
            tournaments: parsed.tournaments ?? [],
            activeTournamentId: parsed.activeTournamentId ?? parsed.tournaments?.[0]?.id ?? null,
          })
          setExportNotice('Khôi phục dữ liệu thành công')
        } catch {
          window.alert('Tệp dữ liệu không hợp lệ.')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleDeleteAll = () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu?')) return
    setAppState(defaultAppState())
    setActiveSection('overview')
  }

  const renderEmptyState = (title: string, description: string) => (
    <div className="empty-state">
      <div className="empty-state__icon"><Trophy size={28} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="primary-button" onClick={openCreateTournament} type="button">
        <Plus size={16} /> Tạo giải đấu mới
      </button>
    </div>
  )

  const renderOverview = () => {
    if (!activeTournament) {
      return renderEmptyState('Chưa có giải đấu nào', 'Tạo giải đấu để bắt đầu quản lý điểm, vòng đấu và xếp hạng.')
    }

    const overview = getOverviewStats(activeTournament)
    const leader = overview.currentLeader

    return (
      <>
        <div className="page-header">
          <div>
            <p className="eyebrow">Tổng quan</p>
            <h2>{activeTournament.name}</h2>
          </div>
        </div>

        <section className="round-entry panel">
          <div className="round-entry__heading">
            <div>
              <p className="eyebrow">{activeTournament.status === 'completed' ? 'Giải đấu đã khép lại' : `VÒNG ${activeTournament.currentRound} / ${activeTournament.totalRounds}`}</p>
              <h3>{activeTournament.status === 'completed' ? 'Đã hoàn thành' : `Nhập kết quả vòng ${activeTournament.currentRound}`}</h3>
            </div>
            {activeTournament.status !== 'completed' && <span className="round-status">{activeTournament.status === 'paused' ? 'ĐANG TẠM DỪNG' : 'SẴN SÀNG'}</span>}
          </div>
          {activeTournament.status !== 'completed' && (
            <form
              className="round-entry__form"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target instanceof HTMLSelectElement) {
                  event.preventDefault()
                  event.currentTarget.requestSubmit()
                }
              }}
              onSubmit={(event) => {
                event.preventDefault()
                const currentDraft = roundEditor?.round === activeTournament.currentRound
                  ? roundEditor
                  : {
                      round: activeTournament.currentRound,
                      results: activeTournament.players.map((player, index) => ({
                        playerId: player.id,
                        rank: activeTournament.rounds
                          .find((round) => round.round === activeTournament.currentRound)
                          ?.results.find((result) => result.playerId === player.id)?.rank ?? index + 1,
                      })),
                    }
                setRoundResults(currentDraft)
              }}
            >
              <div className="round-entry__players">
                {activeTournament.players.map((player, index) => {
                  const round = activeTournament.rounds.find((item) => item.round === activeTournament.currentRound)
                  const selectedRank = roundEditor?.round === activeTournament.currentRound
                    ? roundEditor.results.find((entry) => entry.playerId === player.id)?.rank ?? index + 1
                    : round?.results.find((entry) => entry.playerId === player.id)?.rank ?? index + 1
                  return (
                    <label className="round-entry__player" key={player.id}>
                      <img src={getPlayerAvatar(player, index)} alt="" />
                      <span>{player.displayName}</span>
                      <select
                        aria-label={`Thứ hạng của ${player.displayName}`}
                        value={selectedRank}
                        onChange={(event) => {
                          const currentDraft = roundEditor?.round === activeTournament.currentRound
                            ? roundEditor
                            : {
                                round: activeTournament.currentRound,
                                results: activeTournament.players.map((entry, playerIndex) => ({
                                  playerId: entry.id,
                                  rank: activeTournament.rounds
                                    .find((item) => item.round === activeTournament.currentRound)
                                    ?.results.find((result) => result.playerId === entry.id)?.rank ?? playerIndex + 1,
                                })),
                              }
                          setRoundEditor({
                            ...currentDraft,
                            results: currentDraft.results.map((entry) => entry.playerId === player.id
                              ? { ...entry, rank: Number(event.target.value) }
                              : entry),
                          })
                        }}
                      >
                        {Array.from({ length: 8 }, (_, rankIndex) => (
                          <option key={rankIndex + 1} value={rankIndex + 1}>#{rankIndex + 1}</option>
                        ))}
                      </select>
                    </label>
                  )
                })}
              </div>
              <div className="round-entry__footer">
                <span>Chọn thứ hạng rồi nhấn Enter hoặc nút lưu. Thứ hạng trùng sẽ bị từ chối.</span>
                <button className="primary-button" type="submit"><CheckCircle2 size={16} /> Lưu kết quả vòng</button>
              </div>
            </form>
          )}
          {activeTournament.status !== 'completed' && ranking.some((player) => player.champion) && (
            <div className="round-entry__complete">
              <p>Đã có nhà vô địch theo luật của giải. Bạn có thể hoàn thành giải để lưu kết quả.</p>
              <button className="primary-button" type="button" onClick={() => setStatus('completed')}>
                <CheckCircle2 size={16} /> Hoàn thành giải
              </button>
            </div>
          )}
          {activeTournament.status === 'completed' && (
            <span className="round-status round-status--complete">GIẢI ĐÃ HOÀN THÀNH</span>
          )}
        </section>

        <div className="stats-grid">
          {summaryCards.map((card) => (
            <div key={card.label} className={`stat-card ${card.accent}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>

        <div className="summary-layout">
          <div className="panel">
            <div className="panel-header">
              <h3>Người dẫn đầu</h3>
            </div>
            {leader ? (
              <div className="leader-box">
                <div className="leader-meta">
                  <img
                    className="leader-avatar avatar-image"
                    src={getPlayerAvatar(leader, activeTournament.players.findIndex((player) => player.id === leader.id))}
                    alt={`Ảnh đại diện ${leader.displayName}`}
                  />
                  <div>
                    <h4>{leader.displayName}</h4>
                    <p>{leader.totalPoints} điểm</p>
                  </div>
                </div>
                <div className="champion-visual" aria-label="Nhà vô địch">
                  <img
                    className="champion-trophy"
                    src="/champion-trophy.png"
                    alt="Nhà vô địch"
                  />
                </div>
              </div>
            ) : (
              <p>Chưa có dữ liệu</p>
            )}
          </div>

          <div className="panel archive-shortcut">
            <div className="panel-header"><h3>Giải đấu đã lưu</h3></div>
            <p>{appState.tournaments.filter((tournament) => tournament.status === 'completed').length} giải đã hoàn thành và được lưu trữ.</p>
            <button className="secondary-button" type="button" onClick={() => setActiveSection('history')}>Mở lưu trữ &amp; so sánh</button>
          </div>
        </div>

        <div className="panel chart-panel">
          <div className="panel-header">
            <h3>Phong độ qua từng vòng</h3>
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={statsForCharts}>
                <defs>
                  <linearGradient id="scoreArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
                <XAxis dataKey="round" stroke="#a4b0c3" />
                <YAxis stroke="#a4b0c3" />
                <Tooltip />
                <Area type="monotone" dataKey={leader?.displayName ?? 'Tổng'} stroke="#7c3aed" fill="url(#scoreArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>
    )
  }

  const renderTournament = () => {
    if (!activeTournament) {
      return renderEmptyState('Chưa có giải đấu nào', 'Tạo giải đấu để bắt đầu quản lý điểm, vòng đấu và xếp hạng.')
    }

    return (
      <div className="panel">
        <div className="panel-header flex-between">
          <h3>Quản lý giải đấu</h3>
        </div>

        <div className="form-grid two-columns">
          <label>
            <span>Tên giải</span>
            <input value={editingTournamentName} onChange={(event) => setEditingTournamentName(event.target.value)} />
          </label>
          <label>
            <span>Trạng thái</span>
            <div className="chip-row">
              <span className={`status-badge ${activeTournament.status}`}>{activeTournament.status}</span>
            </div>
          </label>
          <label>
            <span>Số vòng</span>
            <input
              type="number"
              min={1}
              max={12}
              value={activeTournament.totalRounds}
              onChange={(event) =>
                updateActiveTournament((tournament) => ({
                  ...tournament,
                  totalRounds: clamp(Number(event.target.value) || 1, 1, 12),
                  lastUpdated: new Date().toISOString(),
                }))
              }
            />
          </label>
          <label>
            <span>Vòng hiện tại</span>
            <input
              type="number"
              min={1}
              max={activeTournament.totalRounds}
              value={activeTournament.currentRound}
              onChange={(event) =>
                updateActiveTournament((tournament) => ({
                  ...tournament,
                  currentRound: clamp(Number(event.target.value) || 1, 1, tournament.totalRounds),
                  lastUpdated: new Date().toISOString(),
                }))
              }
            />
          </label>
        </div>

        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={() =>
              updateActiveTournament((tournament) => ({
                ...tournament,
                name: editingTournamentName.trim() || tournament.name,
                lastUpdated: new Date().toISOString(),
              }))
            }
          >
            <Save size={16} /> Lưu thay đổi
          </button>
        </div>

        <div className="divider" />

        <div className="section-header-inline">
          <h4>Danh sách người chơi</h4>
        </div>
        <div className="player-editor">
          <input
            placeholder="Tên người chơi"
            value={playerDraft.name}
            onChange={(event) => setPlayerDraft((previous) => ({ ...previous, name: event.target.value }))}
          />
          <button className="primary-button" type="button" onClick={addPlayer}><Plus size={16} /> Thêm</button>
        </div>

        <div className="player-list">
          {activeTournament.players.map((player, index) => (
            <div key={player.id} className="player-card">
              <div className="player-identity">
                <img className="avatar-small avatar-image" src={getPlayerAvatar(player, index)} alt={`Ảnh đại diện ${player.displayName}`} />
                <div>
                  <strong>{player.displayName}</strong>
                  <small>ID: {player.id.slice(0, 8)}</small>
                </div>
              </div>
              <button className="ghost-button" type="button" onClick={() => deletePlayer(player.id)}><Trash2 size={14} /> Xóa</button>
            </div>
          ))}
        </div>

        <div className="divider" />

        <div className="section-header-inline">
          <h4>Thang điểm</h4>
        </div>
        <div className="score-table-grid">
          {activeTournament.scoreTable.map((entry) => (
            <label key={entry.rank} className="score-row">
              <span>Top {entry.rank}</span>
              <input
                type="number"
                min={0}
                max={20}
                value={entry.points}
                onChange={(event) => {
                  const nextPoints = Number(event.target.value) || 0
                  updateActiveTournament((tournament) => ({
                    ...tournament,
                    scoreTable: normalizeScoreTable(
                      tournament.scoreTable.map((item) =>
                        item.rank === entry.rank ? { ...item, points: nextPoints } : item,
                      ),
                    ),
                    lastUpdated: new Date().toISOString(),
                  }))
                }}
              />
            </label>
          ))}
        </div>

      </div>
    )
  }

  const renderPlayers = () => {
    if (!activeTournament) return renderEmptyState('Chưa có người chơi', 'Tạo giải đấu để thêm lâu người chơi và quản lý thành tích.')

    const filteredPlayers = ranking.filter((player) =>
      player.displayName.toLowerCase().includes(playerSearch.toLowerCase()),
    )

    return (
      <div className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Người chơi</p>
            <h2>Thống kê thành tích</h2>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Tìm kiếm người chơi" />
          </label>
        </div>

        <div className="player-summary-grid">
          {filteredPlayers.map((player) => (
            <div key={player.id} className="player-stat-card">
              <div className="player-stat-top">
                <img
                  className="avatar-medium avatar-image"
                  src={getPlayerAvatar(player, activeTournament.players.findIndex((entry) => entry.id === player.id))}
                  alt={`Ảnh đại diện ${player.displayName}`}
                />
                <div>
                  <h4>{player.displayName}</h4>
                  <small>ID {player.id.slice(0, 8)}</small>
                </div>
              </div>
              <div className="metric-grid">
                <div><span>Số trận</span><strong>{player.roundsPlayed}</strong></div>
                <div><span>Tổng điểm</span><strong>{player.totalPoints}</strong></div>
                <div><span>Top 1</span><strong>{player.top1s}</strong></div>
                <div><span>Top 4</span><strong>{player.top4s}</strong></div>
                <div><span>TB xếp hạng</span><strong>{player.averageRank ? player.averageRank.toFixed(1) : '—'}</strong></div>
                <div><span>Thành tích tốt nhất</span><strong>{player.bestFinish === 99 ? '—' : `Top ${player.bestFinish}`}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderRanking = () => {
    if (!activeTournament) return renderEmptyState('Chưa có bảng xếp hạng', 'Khi có giải đấu và kết quả trận, bảng xếp hạng sẽ tự động cập nhật.')

    return (
      <div className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Bảng xếp hạng</p>
            <h2>Thứ hạng hiện tại</h2>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hạng</th>
                <th>Người chơi</th>
                <th>Điểm gần nhất</th>
                <th>Tổng điểm</th>
                <th>Top 1</th>
                <th>TB xếp hạng</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((player, index) => (
                <tr key={player.id} className={index === 0 ? 'leader-row' : ''}>
                  <td>#{index + 1}</td>
                  <td>
                    <div className="ranking-player">
                      <img
                        className="avatar-small avatar-image"
                        src={getPlayerAvatar(player, activeTournament.players.findIndex((entry) => entry.id === player.id))}
                        alt=""
                      />
                      <strong>{player.displayName}</strong>
                      {player.checkmate && <span className="tag checkmate">CHECKMATE</span>}
                      {player.champion && <span className="tag champion"><Trophy size={12} /> VÔ ĐỊCH</span>}
                    </div>
                  </td>
                  <td>{player.recentPoints}</td>
                  <td>{player.totalPoints}</td>
                  <td>{player.top1s}</td>
                  <td>{player.averageRank ? player.averageRank.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderCheckPage = () => {
    if (!activeTournament) return renderEmptyState('Chưa có dữ liệu check', 'Tạo giải đấu và nhập kết quả để xem trạng thái bảng xếp hạng chi tiết.')

    const topThree = ranking.slice(0, 3)

    return (
      <div className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Check bảng xếp hạng</p>
            <h2>Kiểm tra nhanh thành tích</h2>
          </div>
        </div>

        <div className="stats-grid">
          {topThree.map((player, index) => (
            <div key={player.id} className={`stat-card ${index === 0 ? 'purple' : index === 1 ? 'cyan' : 'green'}`}>
              <span>Top {index + 1}</span>
              <strong>{player.displayName}</strong>
              <small>{player.totalPoints} điểm • {player.top1s} lần vô địch</small>
            </div>
          ))}
        </div>

        <div className="check-grid">
          <div className="mini-chart">
            <h3>Điểm số hiện tại</h3>
            <div className="check-list">
              {ranking.map((player, index) => (
                <div key={player.id} className="check-row">
                  <div className="check-rank">#{index + 1}</div>
                  <img
                    className="check-avatar"
                    src={getPlayerAvatar(player, activeTournament.players.findIndex((entry) => entry.id === player.id))}
                    alt=""
                  />
                  <div className="check-player">
                    <strong>{player.displayName}</strong>
                    <span>{player.roundsPlayed} trận</span>
                  </div>
                  <div className="check-score">{player.totalPoints}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mini-chart">
            <h3>Điều kiện đặc biệt</h3>
            <div className="check-list">
              {ranking.map((player) => (
                <div key={player.id} className="check-row check-row--plain">
                  <img
                    className="check-avatar"
                    src={getPlayerAvatar(player, activeTournament.players.findIndex((entry) => entry.id === player.id))}
                    alt=""
                  />
                  <div className="check-player">
                    <strong>{player.displayName}</strong>
                    <span>{player.checkmate ? 'CHECKMATE' : 'Chưa đạt checkmate'}</span>
                  </div>
                  <div className="check-badge-wrap">
                    {player.checkmate && <span className="tag checkmate">CHECKMATE</span>}
                    {player.champion && <span className="tag champion">VÔ ĐỊCH</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderHistory = () => {
    const archivedTournaments = appState.tournaments
      .filter((tournament) => tournament.status === 'completed')
      .sort((first, second) => new Date(second.completedAt ?? second.lastUpdated).getTime() - new Date(first.completedAt ?? first.lastUpdated).getTime())
    const firstCompared = archivedTournaments.find((tournament) => tournament.id === comparisonTournamentIds[0])
    const secondCompared = archivedTournaments.find((tournament) => tournament.id === comparisonTournamentIds[1])
    const playerNames = [...new Set(archivedTournaments.flatMap((tournament) => tournament.players.map((player) => player.displayName)))]
    const playerHistory = playerNames.map((displayName) => {
      const entries = archivedTournaments.flatMap((tournament) => {
        const player = tournament.players.find((entry) => entry.displayName === displayName)
        if (!player) return []
        const results = tournament.rounds.flatMap((round) =>
          round.results.filter((entry) => entry.playerId === player.id),
        )
        return [{
          points: results.reduce((total, result) => total + result.points, 0),
          top1s: results.filter((result) => result.rank === 1).length,
          averageRank: results.length ? results.reduce((total, result) => total + result.rank, 0) / results.length : 0,
          won: getTournamentRanking(tournament)[0]?.id === player.id,
        }]
      })
      return {
        displayName,
        tournamentCount: entries.length,
        wins: entries.filter((entry) => entry.won).length,
        points: entries.reduce((total, entry) => total + entry.points, 0),
        top1s: entries.reduce((total, entry) => total + entry.top1s, 0),
        averageRank: entries.length ? entries.reduce((total, entry) => total + entry.averageRank, 0) / entries.length : 0,
      }
    }).sort((first, second) => second.wins - first.wins || second.points - first.points)
    const statsForTournament = (tournament: Tournament | undefined, displayName: string) => {
      if (!tournament) return null
      const player = tournament.players.find((entry) => entry.displayName === displayName)
      if (!player) return null
      const results = tournament.rounds.flatMap((round) => round.results.filter((entry) => entry.playerId === player.id))
      return {
        points: results.reduce((total, result) => total + result.points, 0),
        top1s: results.filter((result) => result.rank === 1).length,
        averageRank: results.length ? results.reduce((total, result) => total + result.rank, 0) / results.length : 0,
      }
    }
    const describeStats = (stats: ReturnType<typeof statsForTournament>) =>
      stats ? `${stats.points} / ${stats.top1s} / ${stats.averageRank.toFixed(1)}` : '—'

    return (
      <div className="archive-page">
        <div className="page-header">
          <div>
            <p className="eyebrow">THÀNH TÍCH ĐƯỢC LƯU GIỮ</p>
            <h2>Lưu trữ &amp; so sánh</h2>
          </div>
        </div>
        {archivedTournaments.length ? (
          <>
            <section className="archive-grid">
              {archivedTournaments.map((tournament) => {
                const winner = getTournamentRanking(tournament)[0]
                return (
                  <article className="archive-card" key={tournament.id}>
                    <div className="archive-card__top">
                      <span className="round-status">ĐÃ LƯU</span>
                      <span>{formatDate(tournament.completedAt ?? tournament.lastUpdated)}</span>
                    </div>
                    <h3>{tournament.name}</h3>
                    <p>{tournament.rounds.length} vòng <span>•</span> {tournament.players.length} cờ thủ</p>
                    {winner && <div className="archive-card__winner"><Trophy size={17} /> {winner.displayName}</div>}
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setAppState((previous) => ({ ...previous, activeTournamentId: tournament.id }))
                        setActiveSection('overview')
                      }}
                    >
                      Xem lại giải này
                    </button>
                  </article>
                )
              })}
            </section>
            <section className="panel archive-comparison">
              <div className="panel-header">
                <div><p className="eyebrow">BẢNG THÀNH TÍCH</p><h3>So sánh cờ thủ qua các giải</h3></div>
              </div>
              <div className="archive-table-wrap">
                <table className="archive-table">
                  <thead><tr><th>Cờ thủ</th><th>Số giải</th><th>Vô địch</th><th>Tổng điểm</th><th>Top 1</th><th>Hạng TB</th></tr></thead>
                  <tbody>
                    {playerHistory.map((player) => (
                      <tr key={player.displayName}>
                        <td><strong>{player.displayName}</strong></td><td>{player.tournamentCount}</td>
                        <td>{player.wins}</td><td>{player.points}</td><td>{player.top1s}</td>
                        <td>{player.averageRank ? player.averageRank.toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="archive-selectors">
                <label>Giải thứ nhất
                  <select value={comparisonTournamentIds[0]} onChange={(event) => setComparisonTournamentIds((previous) => [event.target.value, previous[1]])}>
                    <option value="">Chọn giải</option>
                    {archivedTournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
                  </select>
                </label>
                <span className="archive-versus">VS</span>
                <label>Giải thứ hai
                  <select value={comparisonTournamentIds[1]} onChange={(event) => setComparisonTournamentIds((previous) => [previous[0], event.target.value])}>
                    <option value="">Chọn giải</option>
                    {archivedTournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
                  </select>
                </label>
              </div>
              {firstCompared && secondCompared && (
                <div className="archive-table-wrap">
                  <table className="archive-table">
                    <thead><tr><th>Cờ thủ</th><th>{firstCompared.name} · điểm / Top 1 / hạng TB</th><th>{secondCompared.name} · điểm / Top 1 / hạng TB</th></tr></thead>
                    <tbody>
                      {playerNames.map((displayName) => {
                        const firstStats = statsForTournament(firstCompared, displayName)
                        const secondStats = statsForTournament(secondCompared, displayName)
                        if (!firstStats && !secondStats) return null
                        return <tr key={displayName}><td><strong>{displayName}</strong></td><td>{describeStats(firstStats)}</td><td>{describeStats(secondStats)}</td></tr>
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon"><Trophy size={28} /></div>
            <h3>Chưa có giải đấu hoàn thành</h3>
            <p>Khi bạn hoàn thành một giải, kết quả sẽ được lưu tại đây để xem lại và so sánh.</p>
          </div>
        )}
      </div>
    )
  }

  const renderStats = () => {
    if (!activeTournament) return renderEmptyState('Chưa có thống kê', 'Sau khi có dữ liệu giải, biểu đồ sẽ hiển thị tổng điểm và phong độ.')

    const playerBars = ranking.map((player) => ({
      name: player.displayName.slice(0, 10),
      value: player.totalPoints,
    }))

    const top1Counts = ranking.map((player) => ({
      name: player.displayName.slice(0, 8),
      value: player.top1s,
    }))

    return (
      <div className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Thống kê</p>
            <h2>Biểu đồ giải đấu</h2>
          </div>
        </div>

        <div className="chart-grid">
          <div className="mini-chart">
            <h3>Tổng điểm theo người chơi</h3>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={playerBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
                  <XAxis dataKey="name" stroke="#a4b0c3" />
                  <YAxis stroke="#a4b0c3" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mini-chart">
            <h3>Số lần Top 1</h3>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top1Counts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
                  <XAxis dataKey="name" stroke="#a4b0c3" />
                  <YAxis stroke="#a4b0c3" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#fbbf24" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mini-chart full-width">
            <h3>Phòng độ qua từng vòng</h3>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={statsForCharts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
                  <XAxis dataKey="round" stroke="#a4b0c3" />
                  <YAxis stroke="#a4b0c3" />
                  <Tooltip />
                  {activeTournament.players.map((player, index) => (
                    <Line
                      key={player.id}
                      type="monotone"
                      dataKey={player.displayName}
                      stroke={['#7c3aed', '#38bdf8', '#fbbf24', '#34d399'][index % 4]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderSettings = () => {
    const updateScoringRule = (rank: number, points: number) => {
      const nextScoreTable = normalizeScoreTable(
        appState.defaultScoreTable.map((entry) => entry.rank === rank ? { ...entry, points } : entry),
      )
      setAppState((previous) => ({
        ...previous,
        defaultScoreTable: nextScoreTable,
        tournaments: previous.tournaments.map((tournament) =>
          tournament.id === activeTournament?.id && tournament.status !== 'completed'
            ? { ...tournament, scoreTable: nextScoreTable, lastUpdated: currentTimestamp() }
            : tournament,
        ),
      }))
    }

    const updateChampionThreshold = (threshold: number) => {
      setAppState((previous) => ({
        ...previous,
        championThreshold: threshold,
        tournaments: previous.tournaments.map((tournament) =>
          tournament.id === activeTournament?.id && tournament.status !== 'completed'
            ? { ...tournament, championThreshold: threshold, lastUpdated: currentTimestamp() }
            : tournament,
        ),
      }))
    }

    return (
      <div className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Cài đặt</p>
            <h2>Thiết lập giải đấu</h2>
          </div>
        </div>

        <div className="form-grid two-columns">
          <label>
            <span>Tên giải đấu mặc định</span>
            <input
              value={appState.defaultName}
              onChange={(event) =>
                setAppState((previous) => ({
                  ...previous,
                  defaultName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Số vòng mặc định</span>
            <input
              type="number"
              min={1}
              max={12}
              value={appState.defaultRoundCount}
              onChange={(event) =>
                setAppState((previous) => ({
                  ...previous,
                  defaultRoundCount: clamp(Number(event.target.value) || 1, 1, 12),
                }))
              }
            />
          </label>
          <label>
            <span>Điểm cần đạt để CHECKMATE</span>
            <input
              type="number"
              min={1}
              max={100}
              value={appState.championThreshold}
              onChange={(event) => updateChampionThreshold(clamp(Number(event.target.value) || 1, 1, 100))}
            />
          </label>
          <label>
            <span>Điều kiện vô địch</span>
            <p className="settings-rule-description">
              CHECKMATE khi đạt ngưỡng điểm; vô địch khi đứng Top 1 ở vòng kế tiếp.
            </p>
          </label>
          <label>
            <span>Giao diện</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setAppState((previous) => ({ ...previous, darkMode: !previous.darkMode }))}
            >
              {appState.darkMode ? <MoonStar size={16} /> : <SunMedium size={16} />}
              {appState.darkMode ? 'Chế độ tối' : 'Chế độ sáng'}
            </button>
          </label>
        </div>

        <div className="divider" />
        <div className="section-header-inline">
          <div>
            <h4>Luật tính điểm</h4>
            <p>Thay đổi sẽ áp dụng cho giải mới và giải đang mở. Giải đã hoàn thành được giữ nguyên.</p>
          </div>
        </div>
        <div className="score-table-grid">
          {appState.defaultScoreTable.map((entry) => (
            <label key={entry.rank} className="score-row">
              <span>Top {entry.rank}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={entry.points}
                onChange={(event) => updateScoringRule(entry.rank, clamp(Number(event.target.value) || 0, 0, 100))}
              />
            </label>
          ))}
        </div>

        <div className="settings-actions">
          <button className="secondary-button" type="button" onClick={handleBackup}><Save size={16} /> Sao lưu</button>
          <button className="secondary-button" type="button" onClick={handleRestore}><RefreshCw size={16} /> Khôi phục</button>
          <button className="secondary-button" type="button" onClick={handleExport}><Download size={16} /> Xuất dữ liệu</button>
          <button className="danger-button" type="button" onClick={handleDeleteAll}><Trash2 size={16} /> Xóa dữ liệu</button>
        </div>
        {exportNotice && <p className="toast-note">{exportNotice}</p>}
      </div>
    )
  }

  if (isAuthLoading) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-panel__content">
            <span className="login-panel__icon"><RefreshCw size={21} /></span>
            <p className="contestant-eyebrow">KẾT NỐI GIẢI ĐẤU</p>
            <h2>Đang tải phiên đăng nhập…</h2>
            <p className="login-panel__description">Đang kết nối Supabase và lấy dữ liệu mới nhất.</p>
          </div>
        </section>
      </main>
    )
  }

  if (!authenticatedAccount) {
    return (
      <main className="login-shell">
        <section className="login-art" aria-label="TFT Tournament">
          <div className="login-art__brand">
            <img className="contestant-brand__mark" src="/tournament-logo.png" alt="Logo Ao Làng LA" />
            <span>
              <strong>TFT TOURNAMENT</strong>
              <small>AO LÀNG LA • MÙA GIẢI</small>
            </span>
          </div>
          <div className="login-art__copy">
            <p className="contestant-eyebrow"><Swords size={14} /> SÂN ĐẤU CỦA BẠN</p>
            <h1>Mỗi vòng đấu,<br />một huyền thoại.</h1>
            <p>Đăng nhập để quản lý giải đấu hoặc theo dõi bảng xếp hạng của các cờ thủ.</p>
          </div>
          <div className="login-art__avatars" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <img key={index} src={`/player-avatars/player-${index + 1}.png`} alt="" />
            ))}
          </div>
          <span className="login-art__watermark">TEAMFIGHT TACTICS</span>
        </section>

        <section className="login-panel">
          <div className="login-panel__content">
            <span className="login-panel__icon"><LockKeyhole size={21} /></span>
            <p className="contestant-eyebrow">CHÀO MỪNG TRỞ LẠI</p>
            <h2>Đăng nhập</h2>
            <p className="login-panel__description">Nhập tài khoản được ban tổ chức cung cấp.</p>

            <form className="login-form" onSubmit={handleLogin}>
              <label>
                <span>Tên đăng nhập</span>
                <div className="login-input-wrap">
                  <Users size={17} />
                  <input
                    autoComplete="username"
                    autoFocus
                    value={loginUsername}
                    onChange={(event) => {
                      setLoginUsername(event.target.value)
                      setLoginError('')
                    }}
                    placeholder="Nhập tên đăng nhập"
                    required
                  />
                </div>
              </label>
              <label>
                <span>Mật khẩu</span>
                <div className="login-input-wrap">
                  <LockKeyhole size={17} />
                  <input
                    autoComplete="current-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(event) => {
                      setLoginPassword(event.target.value)
                      setLoginError('')
                    }}
                    placeholder="Nhập mật khẩu"
                    required
                  />
                  <button
                    className="login-password-toggle"
                    type="button"
                    onClick={() => setShowLoginPassword((shown) => !shown)}
                    aria-label={showLoginPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showLoginPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              {(loginError || (!supabase ? supabaseConfigError : '')) && (
                <p className="login-error" role="alert">{loginError || supabaseConfigError}</p>
              )}
              <button className="login-submit" type="submit" disabled={isLoggingIn || !supabase}>
                {isLoggingIn ? 'Đang đăng nhập…' : 'Vào giải đấu'} <LayoutGrid size={17} />
              </button>
            </form>

            <div className="login-demo-note">
              <ShieldCheck size={16} />
              <span>Tài khoản và quyền truy cập được xác thực qua Supabase.</span>
            </div>
            <p className="login-security-note">
              Dữ liệu giải đấu được đồng bộ trực tiếp giữa quản lý và cổng thí sinh.
            </p>
          </div>
          <footer className="login-panel__footer">TFT TOURNAMENT <span>•</span> AO LÀNG LA</footer>
        </section>
      </main>
    )
  }

  const pageContent = {
    overview: renderOverview(),
    tournament: renderTournament(),
    players: renderPlayers(),
    ranking: renderRanking(),
    check: renderCheckPage(),
    history: renderHistory(),
    stats: renderStats(),
    settings: renderSettings(),
  }[activeSection]

  if (isContestantView) {
    const visibleRanking = ranking.filter((player) =>
      player.displayName.toLocaleLowerCase('vi').includes(playerSearch.toLocaleLowerCase('vi')),
    )
    const lastRound = activeTournament?.rounds
      .slice()
      .sort((a, b) => b.round - a.round)[0]
    const champion = activeTournament
      ? activeTournament.status === 'completed'
        ? ranking[0]
        : ranking.find((player) => player.champion)
      : undefined

    return (
      <div className="contestant-shell">
        <header className="contestant-header">
          <a className="contestant-brand" href="/" onClick={(event) => {
            event.preventDefault()
            changeView(false)
          }}>
            <img className="contestant-brand__mark" src="/tournament-logo.png" alt="Logo Ao Làng LA" />
            <span>
              <strong>TFT TOURNAMENT</strong>
              <small>CỔNG THÍ SINH</small>
            </span>
          </a>
          <div className="contestant-header__right">
            <span className="contestant-greeting">{authenticatedAccount.displayName}</span>
            <span className={`contestant-status ${activeTournament?.status ?? 'draft'}`}>
              <i />
              {activeTournament?.status === 'active' ? 'ĐANG DIỄN RA' : activeTournament?.status === 'completed' ? 'ĐÃ KẾT THÚC' : activeTournament?.status === 'paused' ? 'TẠM DỪNG' : 'CHƯA BẮT ĐẦU'}
            </span>
            <span className={`live-sync-status ${syncStatus}`} title={syncError || 'Đồng bộ trực tiếp'}>
              <i /> {syncStatus === 'syncing' ? 'ĐANG LƯU' : syncStatus === 'error' ? 'LỖI ĐỒNG BỘ' : 'TRỰC TIẾP'}
            </span>
            {authenticatedAccount.role === 'manager' ? (
              <button className="contestant-admin-link" type="button" onClick={() => changeView(false)}>
                <LayoutGrid size={16} /> Trang quản lý
              </button>
            ) : (
              <button className="contestant-admin-link" type="button" onClick={handleLogout}>
                <LogOut size={16} /> Đăng xuất
              </button>
            )}
          </div>
        </header>

        <main className="contestant-main">
          {syncError && <p className="sync-error-banner" role="alert">{syncError}</p>}
          {activeTournament ? (
            <>
              {champion && (
                <section className="contestant-champion-banner" aria-label={`Chúc mừng nhà vô địch ${champion.displayName}`}>
                  <div className="contestant-champion-banner__copy">
                    <p className="contestant-eyebrow"><Trophy size={14} /> {activeTournament.status === 'completed' ? 'NHÀ VÔ ĐỊCH MÙA GIẢI' : 'CHECKMATE · ĐÃ LÊN NGÔI'}</p>
                    <h2>Chúc mừng nhà vô địch!</h2>
                    <strong>{champion.displayName}</strong>
                    <span>{champion.totalPoints} điểm · {champion.top1s} lần Top 1</span>
                  </div>
                  <img
                    className="contestant-champion-banner__avatar"
                    src={getPlayerAvatar(champion, activeTournament.players.findIndex((player) => player.id === champion.id))}
                    alt={`Ảnh đại diện ${champion.displayName}`}
                  />
                  <img className="contestant-champion-banner__trophy" src="/champion-trophy.png" alt="" />
                </section>
              )}
              <section className="contestant-hero">
                <div>
                  <p className="contestant-eyebrow"><Swords size={14} /> BẢNG ĐIỂM GIẢI ĐẤU</p>
                  <h1>{activeTournament.name}</h1>
                  <p className="contestant-hero__sub">
                    Theo dõi thứ hạng và điểm số của các cờ thủ
                  </p>
                </div>
                <div className="contestant-round">
                  <span>VÒNG THI ĐẤU</span>
                  <strong>{Math.min(activeTournament.currentRound, activeTournament.totalRounds)}<i> / {activeTournament.totalRounds}</i></strong>
                </div>
              </section>

              <section className="contestant-highlights" aria-label="Thông tin giải đấu">
                <div className="contestant-highlight">
                  <Users size={18} />
                  <span>Cờ thủ</span>
                  <strong>{activeTournament.players.length}</strong>
                </div>
                <div className="contestant-highlight">
                  <CheckCircle2 size={18} />
                  <span>Vòng đã hoàn thành</span>
                  <strong>{activeTournament.rounds.filter((round) => round.status === 'complete').length}</strong>
                </div>
                <div className="contestant-highlight">
                  <Trophy size={18} />
                  <span>Dẫn đầu hiện tại</span>
                  <strong>{ranking[0]?.displayName ?? 'Chưa có'}</strong>
                </div>
                <div className="contestant-highlight contestant-highlight--updated">
                  <RefreshCw size={18} />
                  <span>Cập nhật gần nhất</span>
                  <strong>{lastRound ? formatDate(lastRound.recordedAt) : 'Chưa có kết quả'}</strong>
                </div>
              </section>

              {ranking.length > 0 && (
                <section className="contestant-podium" aria-label="Ba cờ thủ dẫn đầu">
                  {ranking.slice(0, 3).map((player, index) => (
                    <article key={player.id} className={`contestant-podium-card place-${index + 1}`}>
                      <div className="contestant-podium-card__place">{index === 0 ? '01' : `0${index + 1}`}</div>
                      <img
                        className="contestant-avatar contestant-avatar--portrait"
                        src={getPlayerAvatar(player, activeTournament.players.findIndex((entry) => entry.id === player.id))}
                        alt={`Ảnh đại diện ${player.displayName}`}
                      />
                      <div className="contestant-podium-card__name">{player.displayName}</div>
                      {(player.checkmate || player.champion) && (
                        <div className="contestant-player-status">
                          {player.checkmate && <span className="contestant-checkmate-tag">CHECKMATE</span>}
                          {player.champion && <span className="contestant-champion-tag"><Trophy size={12} /> VÔ ĐỊCH</span>}
                        </div>
                      )}
                      <strong>{player.totalPoints}<small> ĐIỂM</small></strong>
                      <span>{player.top1s} lần Top 1</span>
                    </article>
                  ))}
                </section>
              )}

              <section className="contestant-leaderboard">
                <div className="contestant-leaderboard__header">
                  <div>
                    <p className="contestant-eyebrow">KẾT QUẢ THI ĐẤU</p>
                    <h2>Bảng xếp hạng</h2>
                  </div>
                  <label className="contestant-search">
                    <Search size={16} />
                    <input
                      value={playerSearch}
                      onChange={(event) => setPlayerSearch(event.target.value)}
                      placeholder="Tìm cờ thủ"
                      aria-label="Tìm cờ thủ trong bảng xếp hạng"
                    />
                  </label>
                </div>
                {visibleRanking.length ? (
                  <div className="contestant-table-wrap">
                    <table className="contestant-table">
                      <thead>
                        <tr>
                          <th>HẠNG</th>
                          <th>CỜ THỦ</th>
                          <th>ĐIỂM GẦN NHẤT</th>
                          <th>SỐ VÒNG</th>
                          <th>TOP 1</th>
                          <th>TỔNG ĐIỂM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRanking.map((player) => {
                          const rank = ranking.findIndex((entry) => entry.id === player.id) + 1
                          return (
                            <tr key={player.id} className={rank === 1 ? 'contestant-table__leader' : ''}>
                              <td><span className={`contestant-rank rank-${rank <= 3 ? rank : 'other'}`}>{String(rank).padStart(2, '0')}</span></td>
                              <td>
                                <div className="contestant-table__player">
                                  <img
                                    className="contestant-avatar contestant-avatar--small contestant-avatar--portrait"
                                    src={getPlayerAvatar(player, activeTournament.players.findIndex((entry) => entry.id === player.id))}
                                    alt=""
                                  />
                                  <strong>{player.displayName}</strong>
                                  {player.checkmate && <span className="contestant-checkmate-tag">CHECKMATE</span>}
                                  {player.champion && <span className="contestant-champion-tag"><Trophy size={12} /> VÔ ĐỊCH</span>}
                                </div>
                              </td>
                              <td>{player.recentPoints}<span className="contestant-unit"> điểm</span></td>
                              <td>{player.roundsPlayed}<span className="contestant-unit"> / {activeTournament.totalRounds}</span></td>
                              <td>{player.top1s}</td>
                              <td><strong className="contestant-total">{player.totalPoints}</strong><span className="contestant-unit"> điểm</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="contestant-no-results">Không tìm thấy cờ thủ phù hợp.</p>
                )}
                <footer className="contestant-table__footer">
                  <span>Đang hiển thị {visibleRanking.length} / {ranking.length} cờ thủ</span>
                  <span>Điểm được cập nhật sau mỗi vòng đấu</span>
                </footer>
              </section>
            </>
          ) : (
            <section className="contestant-empty">
              <Trophy size={34} />
              <h1>Chưa có giải đấu</h1>
              <p>Ban tổ chức chưa tạo giải đấu để hiển thị bảng xếp hạng.</p>
            </section>
          )}
        </main>
        <footer className="contestant-footer">TFT TOURNAMENT <span>•</span> BẢNG ĐIỂM TRỰC TIẾP</footer>
      </div>
    )
  }

  return (
    <div className={`app-shell ${appState.darkMode ? 'theme-dark' : 'theme-light'}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/tournament-logo.png" alt="Logo Ao Làng LA" />
          <div>
            <strong>TFT Tournament Pro</strong>
            <small>Ao Làng LA</small>
          </div>
        </div>

        <button className="sidebar-create-button" type="button" onClick={openCreateTournament}>
          <Plus size={17} /> Tạo giải đấu mới
        </button>

        <nav className="sidebar-nav">
          {[
            { key: 'overview', label: 'Tổng quan', icon: LayoutGrid },
            { key: 'players', label: 'Người chơi', icon: Users },
            { key: 'ranking', label: 'Bảng xếp hạng', icon: Trophy },
            { key: 'check', label: 'Check xếp hạng', icon: ShieldCheck },
            { key: 'history', label: 'Lưu trữ & so sánh', icon: Waypoints },
            { key: 'stats', label: 'Thống kê', icon: ShieldCheck },
            { key: 'settings', label: 'Cài đặt', icon: Save },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`nav-item ${activeSection === key ? 'active' : ''}`}
              onClick={() => setActiveSection(key as Section)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="manager-session">
            <span><strong>{authenticatedAccount.displayName}</strong><small>{authenticatedAccount.username} · Quản lý · {syncStatus === 'syncing' ? 'Đang lưu' : syncStatus === 'error' ? 'Lỗi đồng bộ' : 'Trực tiếp'}</small></span>
            <button className="manager-logout" type="button" onClick={handleLogout} aria-label="Đăng xuất">
              <LogOut size={16} />
            </button>
          </div>
          {syncError && <p className="sync-error-sidebar" role="alert">{syncError}</p>}
          <button
            className="contestant-preview-link"
            type="button"
            onClick={() => changeView(true)}
          >
            <Users size={15} /> Xem giao diện thí sinh
          </button>
          {appState.tournaments.length ? (
            <>
              <span>Giải hiện tại</span>
              <select
                value={appState.activeTournamentId ?? ''}
                onChange={(event) => setAppState((previous) => ({ ...previous, activeTournamentId: event.target.value }))}
              >
                {appState.tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>{tournament.name}</option>
                ))}
              </select>
            </>
          ) : (
            <span>Chưa có giải đấu</span>
          )}
        </div>
      </aside>

      <main className="main-panel">
        {pageContent}
      </main>

      {isCreateTournamentOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateTournamentOpen(false)}>
          <section className="modal-card create-tournament-modal" onClick={(event) => event.stopPropagation()} aria-labelledby="create-tournament-title">
            <div className="create-tournament-modal__hero">
              <div>
                <p className="eyebrow">BƯỚC VÀO ĐẤU TRƯỜNG</p>
                <h2 id="create-tournament-title">Thiết lập mùa giải mới</h2>
                <p>Tên giải, thể thức tính điểm và danh sách cờ thủ.</p>
              </div>
              <img src="/champion-trophy.png" alt="" />
              <button className="ghost-button create-modal-close" type="button" onClick={() => setIsCreateTournamentOpen(false)} aria-label="Đóng">×</button>
            </div>
            <form className="create-tournament-form" onSubmit={addTournament}>
              <div className="form-grid two-columns">
                <label><span>Tên giải đấu</span>
                  <input autoFocus required value={newTournamentForm.name} onChange={(event) => setNewTournamentForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="Ví dụ: Ao Làng mùa 2" />
                </label>
                <label><span>Số cờ thủ</span>
                  <select value={newTournamentForm.playerCount} onChange={(event) => setNewTournamentForm((previous) => ({ ...previous, playerCount: Number(event.target.value) }))}>
                    {[4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} cờ thủ</option>)}
                  </select>
                </label>
                <label><span>Số vòng đấu</span>
                  <input type="number" min={1} max={12} required value={newTournamentForm.totalRounds} onChange={(event) => setNewTournamentForm((previous) => ({ ...previous, totalRounds: clamp(Number(event.target.value) || 1, 1, 12) }))} />
                </label>
              </div>
              <div className="create-tournament-form__players">
                <div className="panel-header"><div><p className="eyebrow">ĐỘI HÌNH THAM CHIẾN</p><h3>Nhập tên cờ thủ</h3></div></div>
                <div className="create-player-grid">
                  {newTournamentForm.playerNames.slice(0, newTournamentForm.playerCount).map((name, index) => (
                    <label className="create-player-field" key={index}>
                      <img src={`/player-avatars/player-${(index % 8) + 1}.png`} alt="" />
                      <span>#{index + 1}</span>
                      <input required value={name} onChange={(event) => setNewTournamentForm((previous) => ({
                        ...previous,
                        playerNames: previous.playerNames.map((playerName, playerIndex) => playerIndex === index ? event.target.value : playerName),
                      }))} aria-label={`Tên cờ thủ ${index + 1}`} />
                    </label>
                  ))}
                </div>
              </div>
              <div className="create-tournament-form__footer">
                <button className="secondary-button" type="button" onClick={() => setIsCreateTournamentOpen(false)}>Hủy</button>
                <button className="primary-button" type="submit"><Swords size={16} /> Tạo giải &amp; vào đấu trường</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App

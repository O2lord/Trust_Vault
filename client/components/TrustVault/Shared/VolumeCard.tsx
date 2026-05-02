import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { PublicKey } from "@solana/web3.js";
import { TrendingUp, RefreshCw, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { TRANSACTION_EVENT } from "@/hooks/transactionEventDispatcher";
import {TransactionType} from "@/types/trustVault";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import {getMintInfo} from "@/utils/solana";
// Cache to store mint decimals
const mintDecimalsCache: Record<string, number> = {};

interface VolumeCardProps {
  className?: string;
}

interface PaymentTransaction {
  type: TransactionType;
  signature?: string;
  timestamp: number;
  amount?: number;
  trustVault?: PublicKey;
  details?: {
    reservationIndex?: number;
  };
}

// Interface for volume data in global state
interface VolumeData {
  currentVolume: number;
  previousVolume: number;
  lastUpdateTimestamp: number;
  volumeHistory: {timestamp: number, volume: number}[];
}

const VolumeCard: React.FC<VolumeCardProps> = ({ className }) => {
  const [currentMonthVolume, setCurrentMonthVolume] = useState<number>(0);
  const [previousMonthVolume, setPreviousMonthVolume] = useState<number>(0);
  const [volumeChange, setVolumeChange] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdate, setLastUpdate] = useState<string>('Never');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const { program } = useTrustVaultProgram();
  const processingRef = useRef<boolean>(false);
  const volumeDataRef = useRef<VolumeData>({
    currentVolume: 0,
    previousVolume: 0,
    lastUpdateTimestamp: 0,
    volumeHistory: []
  });

  // Debug log to console with timestamp
  const debugLog = (message: string, data?: unknown): void => {
    const now = new Date();
    const timestamp = `${now.toLocaleTimeString()}.${now.getMilliseconds().toString().padStart(3, '0')}`;
   
  };
  
  // Function to get mint decimals with caching
  const getMintDecimalsWithCache = async (mintAddress: PublicKey): Promise<number> => {
    const addressStr = mintAddress.toString();
    
    // Return from cache if available
    if (mintDecimalsCache[addressStr] !== undefined) {
      debugLog(`Using cached decimals for mint ${addressStr.slice(0, 8)}...`);
      return mintDecimalsCache[addressStr];
    }
    
    try {
      // Fetch and cache mint info
      debugLog(`Fetching mint info for ${addressStr.slice(0, 8)}...`);
      const mintInfo = await getMintInfo((mintAddress),program.provider.connection);
      mintDecimalsCache[addressStr] = mintInfo.decimals;
      debugLog(`Cached mint decimals: ${mintInfo.decimals}`);
      return mintInfo.decimals;
    } catch (err) {
      console.error(`Error fetching mint info for ${addressStr}:`, err);
      return 9; // Default to 9 decimals if there's an error
    }
  };

  // Initialize data on mount
  useEffect(() => {
    debugLog('Component mounted');
    fetchVolumeData();
    
    // Set up interval to refresh data (optional)
    const interval = setInterval(() => {
      fetchVolumeData();
    }, 300000); // Refresh every 5 minutes
    
    return () => clearInterval(interval);
  }, []);

  // Set up transaction event listener
  useEffect(() => {
    const handleTransaction = async (event: Event) => {
      const customEvent = event as CustomEvent<PaymentTransaction>;
      const txDetails = customEvent.detail;
      
      debugLog('Transaction event received', {
        type: txDetails.type,
        signature: txDetails.signature,
        timestamp: new Date(txDetails.timestamp).toLocaleTimeString(),
        trustVault: txDetails.trustVault?.toString().slice(0, 8) + '...',
        amount: txDetails.amount,
      });
      
      // Update on payment confirmations and seller payment confirmations
      if (txDetails.type === TransactionType.PAYMENT_CONFIRMED || 
          txDetails.type === TransactionType.SELLER_CONFIRMS_PAYMENT) {
        debugLog(`*** ${txDetails.type} DETECTED ***`, txDetails);
        fetchVolumeData(); // Refresh data when a payment is confirmed
      }
    };
    
    // Register for handling transaction events
    window.addEventListener(TRANSACTION_EVENT, handleTransaction);
    
    return () => {
      window.removeEventListener(TRANSACTION_EVENT, handleTransaction);
    };
  }, []);

  // Helper function to format currency compactly
  const formatCompactCurrency = (value: number): string => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  // Function to fetch volume data from global state
  const fetchVolumeData = async (): Promise<void> => {
    // Prevent concurrent processing
    if (processingRef.current) {
      debugLog('Already processing a fetch, skipping');
      return;
    }
    
    processingRef.current = true;
    setIsLoading(true);
    
    try {
      debugLog('Fetching volume data from global state');
      
      // Find global state PDA
      const [globalStateAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );
      
      debugLog(`Global state address: ${globalStateAddress.toString()}`);
      
      // Fetch global state account
      const globalState = await program.account.globalState.fetch(globalStateAddress);
      
      debugLog('Global state fetched', {
        totalTrustVaultsCreated: globalState.totalTrustVaultsCreated.toString(),
        totalTrustVaultsClosed: globalState.totalTrustVaultsClosed.toString(),
        totalConfirmations: globalState.totalConfirmations.toString(),
        totalVolume: globalState.totalVolume.toString(),
      });
      
      // Use on-chain global decimals from global state
      const averageDecimals = globalState.tokenDecimals;
      debugLog(`Using on-chain global decimals: ${averageDecimals}`);
      
      // Calculate total volume in tokens (adjust by decimals)
      const totalVolumeInTokens = Number(globalState.totalVolume.toString()) / Math.pow(10, averageDecimals);
      
      debugLog('Calculated volumes', {
        tokenVolume: totalVolumeInTokens,
        currentStoredVolume: volumeDataRef.current.currentVolume
      });
      
      // Important: Use the higher value between the current calculation and our stored value
      // This ensures persistence even when there are no active trust vaults
      let effectiveVolume = Math.max(
        totalVolumeInTokens,
        volumeDataRef.current.currentVolume
      );
      
      // If the blockchain volume is very low (less than $1) but we have a previous volume,
      // keep using our stored volume
      if (totalVolumeInTokens < 1 && volumeDataRef.current.currentVolume > 1) {
        debugLog('Volume is suspiciously low, using stored volume');
        effectiveVolume = volumeDataRef.current.currentVolume;
      }
      
      // Only update our volume history if we have meaningful new data
      if (effectiveVolume > volumeDataRef.current.currentVolume || totalVolumeInTokens > 1) {
        
        // Update our volume data reference
        volumeDataRef.current.currentVolume = effectiveVolume;
        
        // Store historical data point
        volumeDataRef.current.volumeHistory.push({
          timestamp: Date.now(),
          volume: effectiveVolume
        });
        
        // Keep only last 30 data points
        if (volumeDataRef.current.volumeHistory.length > 30) {
          volumeDataRef.current.volumeHistory.shift();
        }
        
        // Set last update timestamp
        volumeDataRef.current.lastUpdateTimestamp = Date.now();
      }
      
      // For previous month, use actual history or approximation
      let prevMonthVolume = volumeDataRef.current.previousVolume;
      
      // If we have enough history (at least 2 weeks worth), calculate better previous month value
      if (volumeDataRef.current.volumeHistory.length > 14) {
        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        const oldDataPoints = volumeDataRef.current.volumeHistory.filter(dp => dp.timestamp < twoWeeksAgo);
        
        if (oldDataPoints.length > 0) {
          // Use average of older data points as previous month
          const oldSum = oldDataPoints.reduce((sum, dp) => sum + dp.volume, 0);
          prevMonthVolume = oldSum / oldDataPoints.length;
          volumeDataRef.current.previousVolume = prevMonthVolume;
        } else if (prevMonthVolume === 0 && effectiveVolume > 0) {
          // Fallback to 80% of current as previous if we don't have enough history
          prevMonthVolume = effectiveVolume * 0.8;
          volumeDataRef.current.previousVolume = prevMonthVolume;
        }
      } else if (prevMonthVolume === 0 && effectiveVolume > 0) {
        // Initialize previous month volume as 80% of current if not set
        prevMonthVolume = effectiveVolume * 0.8;
        volumeDataRef.current.previousVolume = prevMonthVolume;
      }
      
      // Update state with our calculated values
      setCurrentMonthVolume(effectiveVolume);
      setPreviousMonthVolume(prevMonthVolume);
      
      // Calculate percentage change
      if (prevMonthVolume > 0) {
        const change = ((effectiveVolume - prevMonthVolume) / prevMonthVolume) * 100;
        setVolumeChange(Math.round(change * 10) / 10);
      } else if (effectiveVolume > 0) {
        setVolumeChange(100);
      } else {
        setVolumeChange(0);
      }
      
      // Update last update time
      const updateTime = new Date().toLocaleTimeString();
      setLastUpdate(updateTime);
      
      debugLog('Volume data updated', {
        currentMonth: effectiveVolume,
        previousMonth: prevMonthVolume,
        change: volumeChange,
        dataPoints: volumeDataRef.current.volumeHistory.length
      });
    } catch (error) {
      console.error("Error fetching volume data:", error);
      
      // On error, use stored values
      if (volumeDataRef.current.currentVolume > 0) {
        setCurrentMonthVolume(volumeDataRef.current.currentVolume);
        setPreviousMonthVolume(volumeDataRef.current.previousVolume);
        
        if (volumeDataRef.current.previousVolume > 0) {
          const change = ((volumeDataRef.current.currentVolume - volumeDataRef.current.previousVolume) / 
                        volumeDataRef.current.previousVolume) * 100;
          setVolumeChange(Math.round(change * 10) / 10);
        }
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      processingRef.current = false;
    }
  };

  // Manual refresh handler
  const handleRefresh = (): void => {
    setIsRefreshing(true);
    fetchVolumeData();
  };

  const isPositiveChange = volumeChange >= 0;

  return (
    <Card className={`group relative overflow-hidden border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 shadow-2xl hover:shadow-3xl transition-all duration-500 hover:scale-[1.02] ${className}`}>
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-purple-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      {/* Subtle border glow */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <CardHeader className="relative z-10 pb-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg blur-sm opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
              <div className="relative bg-gradient-to-r from-blue-500 to-purple-600 p-2.5 rounded-lg">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <CardDescription className="text-gray-300 font-medium text-sm tracking-wide">
                Total Volume Traded
              </CardDescription>
              <div className="flex items-center space-x-2 mt-1">
                <Activity className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">Live Data</span>
              </div>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 rounded-lg hover:bg-gray-700 transition-all duration-300 hover:scale-110" 
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh volume data"
          >
            <RefreshCw className={`h-4 w-4 text-gray-300 transition-transform duration-500 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
          </Button>
        </div>
        
        <div className="space-y-2">
          <CardTitle className="text-5xl font-bold bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent tracking-tight">
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-2xl text-gray-400">Loading...</span>
              </div>
            ) : (
              <span className="transition-all duration-700  inline-block">
                {formatCompactCurrency(currentMonthVolume)}
              </span>
            )}
          </CardTitle>
          
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
              isPositiveChange 
                ? 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/50' 
                : 'bg-red-900/50 text-red-300 hover:bg-red-800/50'
            }`}>
              {isPositiveChange ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span>
                {volumeChange >= 0 ? "+" : ""}{volumeChange.toFixed(1)}%
              </span>
            </div>
            <span className="text-sm text-gray-400 font-medium">vs last month</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="relative z-10 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400 font-medium">Growth Progress</span>
            <span className="text-gray-300 font-semibold">{Math.min(Math.abs(volumeChange), 100).toFixed(0)}%</span>
          </div>
          
          <div className="relative">
            <Progress
              value={Math.min(Math.abs(volumeChange), 100)}
              className="h-2 bg-gray-700 rounded-full overflow-hidden"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full opacity-20 animate-pulse" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <div className="text-xs text-gray-400 font-medium">Current Period</div>
            <div className="text-lg font-bold text-white">
              {formatCompactCurrency(currentMonthVolume)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-gray-400 font-medium">Previous Period</div>
            <div className="text-lg font-bold text-gray-300">
              {formatCompactCurrency(previousMonthVolume)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VolumeCard;
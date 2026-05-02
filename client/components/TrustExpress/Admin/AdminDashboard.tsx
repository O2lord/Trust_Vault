import { useEffect, useState, useCallback, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminSettings } from './AdminSettings';
import { VaultManagement } from './VaultManagement';
import { GlobalStats } from './GlobalStats';
import { ValidatorManagement } from './ValidatorManagement';
import useTrustExpress from '@/hooks/express/useTrustExpress';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Loader2, Settings, BarChart3, Vault, AlertTriangle, Shield, Rocket } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { program, initializeGlobalState } = useTrustExpress();
  const [globalState, setGlobalState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUninitialized, setIsUninitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const hasFetchedRef = useRef(false);

  const fetchGlobalState = useCallback(async () => {
    if (!program || !publicKey) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setIsUninitialized(false);

      const [globalStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('global-state')],
        program.programId
      );

      const state = await program.account.globalState.fetch(globalStatePDA);
      setGlobalState(state);
      setIsLoading(false);
      hasFetchedRef.current = true;
    } catch (error) {
      const isNotInitialized =
        error instanceof Error &&
        (error.message?.includes('Account does not exist') ||
          error.message?.includes('has no data'));

      if (isNotInitialized) {
        setIsUninitialized(true);
        setIsLoading(false);
        hasFetchedRef.current = true;
        return;
      }

      console.error('AdminDashboard: Error fetching global state:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch global state');
      setIsLoading(false);
    }
  }, [program, publicKey]);

  useEffect(() => {
    if (!hasFetchedRef.current && program && publicKey) {
      fetchGlobalState();
    }
  }, [program, publicKey, fetchGlobalState]);

  const handleInitialize = async () => {
    try {
      setIsInitializing(true);
      await initializeGlobalState.mutateAsync();
      toast.success('Global state initialized successfully!');
      hasFetchedRef.current = false;
      await fetchGlobalState();
    } catch (error) {
      console.error('Error initializing global state:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to initialize global state'
      );
    } finally {
      setIsInitializing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading admin dashboard...</p>
      </div>
    );
  }

  if (isUninitialized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 py-12">
        <div className="flex flex-col items-center space-y-6 text-center w-full max-w-md">
          <div className="p-4 rounded-full bg-orange-100 dark:bg-orange-950">
            <Rocket className="h-10 w-10 text-orange-500" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Platform Not Initialized</h3>
            <p className="text-sm text-muted-foreground">
              The global state account hasn&apos;t been created on-chain yet.
              Click below to initialize the platform.
            </p>
          </div>

          <Card className="w-full text-left border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/50">
            <CardContent className="pt-4 space-y-2 text-sm">
              <p className="font-medium">This will set up:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Your wallet as the platform authority</li>
                <li>Default fee: 5 basis points (0.05%)</li>
                <li>Buy &amp; sell orders active</li>
                <li>Empty validator set (3-of-5 threshold)</li>
              </ul>
            </CardContent>
          </Card>

          <Button
            size="lg"
            onClick={handleInitialize}
            disabled={isInitializing}
            className="w-full"
          >
            {isInitializing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Rocket className="mr-2 h-4 w-4" />
                Initialize Global State
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Error Loading Dashboard</h3>
          <p className="text-sm text-muted-foreground max-w-md">{error}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Check the browser console for more details
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => { hasFetchedRef.current = false; fetchGlobalState(); }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <GlobalStats globalState={globalState} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="vaults" className="flex items-center gap-2">
            <Vault className="h-4 w-4" />
            Vault Management
          </TabsTrigger>
          <TabsTrigger value="validators" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Validators
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Platform Health
                </CardTitle>
                <CardDescription>Current platform status and metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">Active Orders</span>
                    <span className="text-sm font-bold">
                      {(globalState?.totalTrustExpressCreated || 0) - (globalState?.totalTrustExpressClosed || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">Success Rate</span>
                    <span className="text-sm font-bold">
                      {globalState?.totalTrustExpressCreated > 0
                        ? ((globalState?.totalConfirmations / globalState?.totalTrustExpressCreated) * 100).toFixed(2)
                        : 0}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  System Status
                </CardTitle>
                <CardDescription>Current system state and controls</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className={`flex justify-between items-center p-3 rounded-lg ${
                    globalState?.buyOrdersPaused ? 'bg-red-50 dark:bg-red-950' : 'bg-green-50 dark:bg-green-950'
                  }`}>
                    <span className="text-sm font-medium">Buy Orders</span>
                    <span className={`text-sm font-bold ${
                      globalState?.buyOrdersPaused ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                      {globalState?.buyOrdersPaused ? 'Paused' : 'Active'}
                    </span>
                  </div>
                  <div className={`flex justify-between items-center p-3 rounded-lg ${
                    globalState?.sellOrdersPaused ? 'bg-red-50 dark:bg-red-950' : 'bg-green-50 dark:bg-green-950'
                  }`}>
                    <span className="text-sm font-medium">Sell Orders</span>
                    <span className={`text-sm font-bold ${
                      globalState?.sellOrdersPaused ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                      {globalState?.sellOrdersPaused ? 'Paused' : 'Active'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">Fee Destination</span>
                    <span className="text-xs font-mono">
                      {globalState?.feeDestination?.toBase58().slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest platform events and transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <p>Activity monitoring coming soon</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <AdminSettings globalState={globalState} onUpdate={fetchGlobalState} />
        </TabsContent>

        <TabsContent value="vaults" className="space-y-4">
          <VaultManagement />
        </TabsContent>

        <TabsContent value="validators" className="space-y-4">
          <ValidatorManagement globalState={globalState} onUpdate={fetchGlobalState} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
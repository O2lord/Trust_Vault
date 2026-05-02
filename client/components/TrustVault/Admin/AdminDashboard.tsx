"use client";
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import useTrustVaultProgram from '@/hooks/useTrustVaultProgram';
import { useTokenMetadata } from '@/hooks/useTokenMetadata';
import { ResolveDisputeButton } from '@/components/TrustVault/Admin/ResolveDisputeButton';
import TokenDisplay from '@/components/ui/token-display';
import EncryptedPaymentDisplay from '@/components/TrustVault/Shared/EncryptedPaymentDisplay';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/seperator';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ExplorerLink from '@/components/ui/explorer-link';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ShieldAlert, 
  AlertTriangle, 
  UserCheck, 
  Clock, 
  User, 
  Coins, 
  CreditCard,
  Search,
  ChevronDown,
  ChevronUp,
  DollarSign
} from 'lucide-react';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Connection } from '@solana/web3.js';
import { useTrustVaultAccounts } from '@/hooks/queries/useTrustVaultAccounts';
import { useGlobalState } from '@/hooks/queries/useGlobalState';
import { ReservationStatus } from '@/types/trustVault';

interface DisputeInfo {
  trustVault: PublicKey;
  reservationIndex: number;
  maker: string;
  taker: string;
  amount: number;
  fiatAmount: number;
  disputeReason: string;
  timestamp: number;
  currency: string;
  disputeId: string;
  pricePerToken: number;
  paymentInstructions: string;
  trustVaultType: number; // 0 = sell-order, 1 = buy-order
  mintA: PublicKey; // Add mint address for token metadata
}

// Component to display token amount with metadata
const DisputeTokenDisplay = ({ amount, mintA }: { amount: number; mintA: PublicKey }) => {
  const tokenMetadata = useTokenMetadata(mintA);
  
  return (
    <TokenDisplay
      amount={amount.toLocaleString()}
      symbol={tokenMetadata?.metadata?.symbol || "TOKEN"}
      logoURI={tokenMetadata?.metadata?.logoURI}
      showSymbol={true}
      className="font-medium"
      imageSize={16}
    />
  );
};

export default function AdminDashboard() {
  const [disputes, setDisputes] = useState<DisputeInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [openCollapsibles, setOpenCollapsibles] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState({
    totalDisputes: 0,
    activeDisputes: 0,
    resolvedDisputes: 0,
    resolutionRate: 0,
  });
  const { publicKey } = useWallet();
  const { program } = useTrustVaultProgram();
  const { data: trustVaultAccounts, refetch: refetchTrustVaults } = useTrustVaultAccounts(program);
  const { data: globalState, error: globalStateError, refetch: refetchGlobalState, getGlobalStatePDA } = useGlobalState(program);
  const connection = new Connection('https://api.devnet.solana.com');

  // Cache for mint decimals to avoid repeated API calls
  const [mintDecimalsCache, setMintDecimalsCache] = useState<Map<string, number>>(new Map());
  
  const toggleCollapsible = (id: string) => {
    setOpenCollapsibles(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Validate if a PublicKey represents a valid mint account
  const isValidMintAddress = (mintAddress: PublicKey): boolean => {
    try {
      // Check if it's not a zero address
      const zeroKey = new PublicKey('11111111111111111111111111111111');
      if (mintAddress.equals(zeroKey)) {
        return false;
      }
      
      // Additional validation could be added here
      return true;
    } catch (error) {
      return false;
    }
  };

  // Enhanced function to get token decimals with support for both SPL Token and Token Extensions
  const getTokenDecimals = async (mintA: PublicKey): Promise<number> => {
    const mintKey = mintA.toString();
    
    // Check cache first
    if (mintDecimalsCache.has(mintKey)) {
      return mintDecimalsCache.get(mintKey)!;
    }
    
    // Validate mint address first
    if (!isValidMintAddress(mintA)) {
      console.warn(`Invalid mint address: ${mintKey}`);
      const fallbackDecimals = 6;
      setMintDecimalsCache(prev => new Map(prev).set(mintKey, fallbackDecimals));
      return fallbackDecimals;
    }
    
    try {
      // First, check if the mint account exists
      const accountInfo = await connection.getAccountInfo(mintA);
      
      if (!accountInfo) {
        console.warn(`Mint account not found: ${mintKey}`);
        const fallbackDecimals = 6;
        setMintDecimalsCache(prev => new Map(prev).set(mintKey, fallbackDecimals));
        return fallbackDecimals;
      }
      
      // Check if it's owned by either SPL Token or Token Extensions program
      const isTokenProgram = accountInfo.owner.equals(TOKEN_PROGRAM_ID);
      const isToken2022Program = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
      
      if (!isTokenProgram && !isToken2022Program) {
        console.warn(`Mint account not owned by token program: ${mintKey} (owner: ${accountInfo.owner.toString()})`);
        const fallbackDecimals = 6;
        setMintDecimalsCache(prev => new Map(prev).set(mintKey, fallbackDecimals));
        return fallbackDecimals;
      }
      
      // Try to get mint info with the appropriate program ID
      let mintInfo;
      if (isToken2022Program) {
        // For Token Extensions, we need to specify the program ID
        mintInfo = await getMint(connection, mintA, 'confirmed', TOKEN_2022_PROGRAM_ID);
      } else {
        // For standard SPL Token
        mintInfo = await getMint(connection, mintA);
      }
      
      const decimals = mintInfo.decimals;
      
      // Cache the result
      setMintDecimalsCache(prev => new Map(prev).set(mintKey, decimals));
      
      return decimals;
    } catch (error) {
      console.warn(`Error fetching mint decimals for ${mintKey}:`, error);
      const fallbackDecimals = 6;
      setMintDecimalsCache(prev => new Map(prev).set(mintKey, fallbackDecimals));
      return fallbackDecimals;
    }
  };
  
  // Use memoized callback to prevent unnecessary API calls
  const loadDisputes = useCallback(async () => {
    if (!publicKey) {
      setIsLoading(false);
      return;
    }
    
    try {
      // Check if the current user is admin using the hook data
      if (globalState?.account?.admin?.equals(publicKey)) {
        setIsAdmin(true);
      } else {
        // If global state isn't loaded yet, try to refetch
        const globalStateResult = await refetchGlobalState();
        if (globalStateResult.data?.account?.admin?.equals(publicKey)) {
          setIsAdmin(true);
        }
      }
      
      // Use the hook data or refetch if needed
      let trustVaultData = trustVaultAccounts;
      if (!trustVaultData) {
        const result = await refetchTrustVaults();
        trustVaultData = result.data;
      }
      
      if (!trustVaultData) {
        setIsLoading(false);
        return;
      }
      
      // Filter trust vault with disputed reservations
      const allDisputes: DisputeInfo[] = [];
      let resolvedCount = 0;
      
      // Process trust vaults sequentially to avoid overwhelming the RPC
      for (const trustVaultDataItem of trustVaultData) {
        const trustVault = trustVaultDataItem.account;
        
        try {
          // Fetch decimals for this trust vault's mint with enhanced error handling
          const decimals = await getTokenDecimals(trustVault.mint);

          trustVault.reservedAmounts.forEach((reservation, index) => {
            if (reservation.status === ReservationStatus.DISPUTED) {
              const reason = reservation.disputeReason || "No reason provided";
              const timestamp = reservation.timestamp ? reservation.timestamp.toNumber() : Date.now();
              const amount = Number(reservation.amount.toString()) / Math.pow(10, decimals);
              const fiatAmount = Number(reservation.fiatAmount.toString());
              const pricePerToken = amount > 0 ? fiatAmount / amount : 0;
              
              allDisputes.push({
                trustVault: trustVaultDataItem.publicKey,
                reservationIndex: index,
                maker: trustVault.maker.toString(),
                taker: reservation.taker.toString(),
                amount: amount,
                fiatAmount: fiatAmount,
                disputeReason: reason,
                timestamp: timestamp,
                currency: String.fromCharCode(...trustVault.currency).trim(),
                disputeId: reservation.disputeId || "Unknown",
                pricePerToken: pricePerToken,
                paymentInstructions: trustVault.paymentInstructions,
                trustVaultType: trustVault.trustVaultType || 0,
                mintA: trustVault.mint
              });
            }
            if (reservation.status === ReservationStatus.RESOLVED) {
              resolvedCount++;
            }
          });
        } catch (error) {
          console.error(`Error processing trust vault ${trustVaultDataItem.publicKey.toString()}:`, error);
          // Continue processing other trust vaults even if one fails
        }
      }
      
      // Sort disputes by timestamp (newest first)
      allDisputes.sort((a, b) => b.timestamp - a.timestamp);
      
      setDisputes(allDisputes);
      
      // Calculate stats
      const totalDisputes = allDisputes.length + resolvedCount;
      const resolutionRate = totalDisputes > 0 ? (resolvedCount / totalDisputes) * 100 : 0;
      
      setStats({
        totalDisputes: totalDisputes,
        activeDisputes: allDisputes.length,
        resolvedDisputes: resolvedCount,
        resolutionRate: resolutionRate
      });
    } catch (error) {
      console.error("Error loading disputes:", error);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, trustVaultAccounts, globalState, refetchTrustVaults, refetchGlobalState, mintDecimalsCache]);
  
  // Load data when component mounts or when dependencies change
  useEffect(() => {
    if (!publicKey) return;
    loadDisputes();
  }, [publicKey, trustVaultAccounts, globalState]);
  
  const handleDisputeResolved = (index: number) => {
    // Remove the resolved dispute from the list
    setDisputes((prevDisputes) => {
      const newDisputes = [...prevDisputes];
      newDisputes.splice(index, 1);
      
      // Update stats
      setStats(prev => ({
        ...prev,
        activeDisputes: prev.activeDisputes - 1,
        resolvedDisputes: prev.resolvedDisputes + 1,
        resolutionRate: ((prev.resolvedDisputes + 1) / prev.totalDisputes) * 100
      }));
      
      return newDisputes;
    });
  };

  // Filter disputes based on search query
  const filteredDisputes = disputes.filter(dispute => 
    dispute.disputeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    dispute.maker.toLowerCase().includes(searchQuery.toLowerCase()) ||
    dispute.taker.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render payment instructions using EncryptedPaymentDisplay
  const renderPaymentInstructions = (dispute: DisputeInfo) => {
    // For buy-order trust vault: pass both trustVaultPubkey and sellerPubkey
    if (dispute.trustVaultType === 1) {
      return (
        <EncryptedPaymentDisplay
          trustVaultPubkey={dispute.trustVault.toString()}
          sellerPubkey={dispute.taker.toString()}
          paymentInstructions={dispute.paymentInstructions}
          className="mt-2"
        />
      );
    }
    
    // For sell-order trust vault: pass only trustVaultPubkey
    return (
      <EncryptedPaymentDisplay
        trustVaultPubkey={dispute.trustVault.toString()}
        paymentInstructions={dispute.paymentInstructions}
        className="mt-2"
      />
    );
  };
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Progress value={30} className="w-64 mb-4" />
        <p className="text-center">Loading dispute data...</p>
      </div>
    );
  }
  
  if (!publicKey) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-xl mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>
          Please connect your wallet to access the admin dashboard.
        </AlertDescription>
      </Alert>
    );
  }
  
  if (globalStateError) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-xl mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Global State</AlertTitle>
        <AlertDescription>
          Failed to load admin configuration. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }
  
  if (!isAdmin) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-xl mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Unauthorized Access</AlertTitle>
        <AlertDescription>
          You do not have the required permissions to access the admin dashboard.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Notice
          </CardTitle>
          <CardDescription>
            Admins should use this dashboard to monitor and resolve disputes across the platform and make sure the proof provided are correct before resolving dispute.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="group/stat relative overflow-hidden border border-gray-700 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:from-gray-700/50 hover:to-gray-800/50 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5 opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300" />
              <CardContent className="pt-6 relative">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-400">Total Disputes</span>
                    <span className="text-2xl font-bold text-white">{stats.totalDisputes}</span>
                  </div>
                  <div className='relative'>
                    <div className="absolute inset-0 bg-amber-500 rounded-full blur-sm opacity-30" />
                    <AlertTriangle className="h-8 w-8 text-amber-400 relative" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="group/stat relative overflow-hidden border border-gray-700 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:from-gray-700/50 hover:to-gray-800/50 transition-all duration-300">
             <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-pink-500/5 opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300" />
              <CardContent className="pt-6 relative">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Active Disputes</span>
                    <span className="text-2xl font-bold">{stats.activeDisputes}</span>
                  </div>
                  <div className='relative'>
                    <div className="absolute inset-0 bg-red-500 rounded-full blur-sm opacity-30" />
                    <ShieldAlert className="h-8 w-8 text-red-400 relative" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="group/stat relative overflow-hidden border border-gray-700 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:from-gray-700/50 hover:to-gray-800/50 transition-all duration-300">
             <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-emerald-500/5 opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300" />
              <CardContent className="pt-6 relative">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Resolved Disputes</span>
                    <span className="text-2xl font-bold">{stats.resolvedDisputes}</span>
                  </div>
                  <div className='relative'>
                    <div className="absolute inset-0 bg-green-500 rounded-full blur-sm opacity-30" />
                    <UserCheck className="h-8 w-8 text-green-400 relative" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="group/stat relative overflow-hidden border border-gray-700 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:from-gray-700/50 hover:to-gray-800/50 transition-all duration-300">
             <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300" />
              <CardContent className="pt-6 relative">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Resolution Rate</span>
                    <span className="text-2xl font-bold">{stats.resolutionRate.toFixed(2)}%</span>
                  </div>
                  <div className='relative'>
                    <div className="absolute inset-0 bg-blue-500 rounded-full blur-sm opacity-30" />
                    <Clock className="h-8 w-8 text-blue-400 relative" />
                  </div>
                </div>
                <Progress value={stats.resolutionRate} className="mt-2" />
              </CardContent>
            </Card>
          </div>
          
          {/* Search bar */}
         <div className="flex gap-4 mb-6">
            <div className="relative flex-1 rounded-lg border border-gray-600 p-1 bg-gray-700 focus-within:border-blue-500">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-300" />
              <Input
                placeholder="Search by Dispute ID, Seller or Buyer address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-transparent border-none outline-none focus:ring-0"
              />
            </div>
            {searchQuery && (
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Clear
              </Button>
            )}
          </div>
          
          {filteredDisputes.length === 0 ? (
            <div className="text-center py-12 border rounded-lg border-dashed">
              {searchQuery ? (
                <>
                  <Search className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium">No Disputes Found</h3>
                  <p className="text-muted-foreground mt-1">No disputes match your search criteria.</p>
                </>
              ) : (
                <>
                  <ShieldAlert className="mx-auto h-12 w-12 text-green-500 mb-3" />
                  <h3 className="text-lg font-medium">No Active Disputes</h3>
                  <p className="text-muted-foreground mt-1">All transactions are currently operating smoothly.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-medium text-white">Active Disputes ({filteredDisputes.length})</h3>
                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                  Requires Attention
                </Badge>
              </div>
              
              {filteredDisputes.map((dispute, index) => {
                const disputeId = `${dispute.trustVault.toString()}-${dispute.reservationIndex}`;
                const trustVaultTypeLabel = dispute.trustVaultType === 1 ? "Buy-Order" : "Sell-Order";
                
                return (
                  <Card key={disputeId} className="border-red-200 dark:border-red-900">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          <span className="flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5 text-red-500" />
                            Dispute #{index + 1} 
                          </span>
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300">
                            Active Dispute
                          </Badge>
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            {trustVaultTypeLabel}
                          </Badge>
                          <Badge variant="secondary" className="font-mono">
                            ID: {dispute.disputeId}
                          </Badge>
                        </div>
                      </div>
                      <CardDescription>
                        {new Date(dispute.timestamp).toLocaleString()}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="pb-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {dispute.trustVaultType === 1 ? "Buyer:" : "Seller:"}
                            </span>
                            <ExplorerLink type="address" value={dispute.maker}>
                            <span className="font-medium">{dispute.maker.slice(0, 4)}...{dispute.maker.slice(-4)}</span>
                            </ExplorerLink>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {dispute.trustVaultType === 1 ? "Seller:" : "Buyer:"}
                            </span>
                            <ExplorerLink type='address' value={dispute.taker}>
                            <span className="font-medium">{dispute.taker.slice(0, 4)}...{dispute.taker.slice(-4)}</span>
                            </ExplorerLink>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Coins className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Amount:</span>
                            <DisputeTokenDisplay amount={dispute.amount} mintA={dispute.mintA} />
                          </div>

                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Price per Token:</span>
                            <span className="font-medium">
                              {dispute.pricePerToken.toFixed(2)} {dispute.currency}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Payment:</span>
                            <span className="font-medium">
                              {dispute.fiatAmount.toLocaleString()} {dispute.currency}
                            </span>
                          </div>
                      
                        </div>
                        
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Dispute Reason:</h4>
                          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md text-sm text-red-800 dark:text-red-300 border border-red-100 dark:border-red-900">
                            {dispute.disputeReason}
                          </div>
                        </div>
                      </div>
                      
                      {/* Collapsible Payment Instructions */}
                      
                      <Collapsible 
                        className="mt-4"
                        open={!!openCollapsibles[disputeId]}
                        onOpenChange={() => toggleCollapsible(disputeId)}
                      >
                        <CollapsibleTrigger asChild>
                          <Button 
                            variant="outline" 
                            className="w-full flex justify-between items-center rounded-t-lg border border-gray-600 p-2 bg-gray-700 hover:border-blue-500 focus:border-blue-500 data-[state=open]:rounded-b-none"
                          >
                            <span className="flex items-center gap-2 text-gray-200">
                              <CreditCard className="h-4 w-4" />
                              Payment Instructions
                            </span>
                            {openCollapsibles[disputeId] ? (
                              <ChevronUp className="h-4 w-4 text-gray-300" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-300" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="rounded-b-lg border-x border-b border-gray-600 bg-gray-700 p-3 -mt-1">
                            {renderPaymentInstructions(dispute)}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                      
                      <Separator className="my-4" />
                      
                      <div className="flex justify-end">
                        <ResolveDisputeButton
                          trustVault={dispute.trustVault}
                          reservationIndex={dispute.reservationIndex}
                          isAdmin={isAdmin}
                          trustVaultType={dispute.trustVaultType}
                          onResolved={() => handleDisputeResolved(index)}
                          className="bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300 dark:hover:bg-amber-800"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}